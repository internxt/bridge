'use strict';

const async = require('async');
const storj = require('storj-lib');
const middleware = require('storj-service-middleware');
const crypto = require('crypto');
const authenticate = middleware.authenticate;
const errors = require('storj-service-error-types');
const Router = require('./index');
const inherits = require('util').inherits;
const ms = require('ms');
const log = require('../../logger');
const constants = require('../../constants');
const limiter = require('../limiter').DEFAULTS;
const _ = require('lodash');
const axios = require('axios');

const getDurationInMilliseconds = (start) => {
  const NS_PER_SEC = 1e9;
  const NS_TO_MS = 1e6;
  const diff = process.hrtime(start);

  return (diff[0] * NS_PER_SEC + diff[1]) / NS_TO_MS;
};

/**
 * Handles endpoints for all frame/file staging related operations
 * @constructor
 * @extends {Router}
 */
function FramesRouter(options) {
  if (!(this instanceof FramesRouter)) {
    return new FramesRouter(options);
  }

  Router.apply(this, arguments);
  this._defaults = options.config.application;
  this._verify = authenticate(this.storage);
  this.getLimiter = middleware.rateLimiter(options.redis);
  this.CLUSTER = Object.values(options.config.application.CLUSTER || []);
}

inherits(FramesRouter, Router);

/**
 * Creates a file staging frame
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
FramesRouter.prototype.createFrame = async function (req, res, next) {
  const { Frame } = this.storage.models;

  const startFreeSpace = process.hrtime();
  const spaceLeft = await userHasFreeSpaceLeft(this.storage, req.user.email);

  log.info('createFrame/freeSpace: %s ms', getDurationInMilliseconds(startFreeSpace).toLocaleString());

  if (!spaceLeft.canUpload) {
    return next(new errors.TransferRateError('Max. space used'));
  }

  const startCreateFrame = process.hrtime();

  const createFrame = () => {
    Frame.create(req.user, function (err, frame) {
      const elapsed = getDurationInMilliseconds(startCreateFrame).toLocaleString();

      if (err) {
        log.error(
          'createFrame/insert: error during frame creation: %s (%s ms elapsed)',
          err.message,
          elapsed
        );

        return next(new errors.InternalError(err.message));
      }
      log.info('createFrame/insert: %s ms', elapsed);

      res.send(frame.toObject());
    });
  };

  if (req.body && req.body.bucketId) {
    const Bucket = this.storage.models.Bucket;

    Bucket.findOne({
      _id: req.body.bucketId,
      user: req.user._id
    }, function (err, bucket) {
      if (err) {
        return next(new errors.InternalError(err.message));
      }

      if (!bucket) {
        return next(new errors.NotFoundError('Bucket not found'));
      }

      createFrame();
    });
  } else {
    createFrame();
  }
};


FramesRouter._sortByResponseTime = function (a, b) {
  const aTime = a.contact.responseTime || Infinity;
  const bTime = b.contact.responseTime || Infinity;

  return (aTime === bTime) ? 0 : (aTime > bTime) ? 1 : -1;
};

FramesRouter._sortByReputation = function (a, b) {
  const aVal = a.contact.reputation || Infinity;
  const bVal = b.contact.reputation || Infinity;

  return (aVal === bVal) ? 0 : (aVal > bVal) ? 1 : -1;
};

FramesRouter._sortByTypeAndResponseTime = function (a, b) {
  const aIsPremium = this.CLUSTER.indexOf(a.contact.nodeID) !== -1;
  const bIsPremium = this.CLUSTER.indexOf(b.contact.nodeID) !== -1;

  // premium nodes first
  if (aIsPremium !== bIsPremium) {
    return aIsPremium ? -1 : 1;
  }

  // then, sort by response time
  return FramesRouter._sortByResponseTime(a, b);
};

FramesRouter.prototype._selectFarmersLegacy = function (excluded, callback) {
  const Contact = this.storage.models.Contact;

  async.parallel([
    (next) => Contact
      .find({
        _id: {
          $gte: crypto.randomBytes(20).toString('hex'),
          $nin: excluded
        },
        reputation: { $gt: this._defaults.publishBenchThreshold },
        spaceAvailable: true
      }).sort({ _id: -1 })
      .limit(this._defaults.publishTotal)
      .exec(next),
    (next) => Contact.find({
      _id: {
        $lt: crypto.randomBytes(20).toString('hex'),
        $nin: excluded
      },
      reputation: { $lte: this._defaults.publishBenchThreshold },
      spaceAvailable: true
    }).sort({ _id: -1 })
      .limit(this._defaults.publishBenchTotal)
      .exec(next)
  ], (err, results) => {
    if (err) {
      return callback(err);
    }

    const combined = [...results[0], ...results[1]];

    callback(null, combined);
  });
};

FramesRouter.prototype._selectFarmer = function (excluded, callback) {
  const { Contact } = this.storage.models;

 Contact.find({ _id: { $in: this.CLUSTER, $nin: excluded } }).sort({ _id: -1 }).exec((err, farmers) => {
    if (err) {
      return callback(err);
    }

    if (!farmers || !farmers.length) {
      return callback(new errors.InternalError('Could not locate farmers'));
    }

    const chosenNode = _.sample(farmers)

    callback(null, chosenNode);
  });
};

FramesRouter.prototype._publishContract = function (chosenNode, contract, audit, callback) {
  const hash = contract.get('data_hash');

  this.contracts.load(hash, (err, item) => {
    if (err) {
      item = new storj.StorageItem({ hash: hash });
    }

    const farmerContact = storj.Contact(chosenNode);

    contract._properties.farmer_id = farmerContact.nodeID
    const farmerContract = storj.Contract(contract._properties)

    item.addContract(farmerContact, farmerContract);
    item.addAuditRecords(farmerContact, audit);

    this.contracts.save(item, (err) => {
      if (err) {
        return callback(new errors.InternalError(err.message));
      }

      const token = crypto.randomBytes(20).toString('hex')

      this.storage.models.Mirror.createWithToken(
        farmerContract._properties,
        farmerContact,
        token,
        (err) => {
          if (err) {
            log.warn(
              'Failed to add mirror to pool, reason: %s',
              err.message
            );
            return callback(new errors.InternalError(err.message))
          }
          callback(null, farmerContact, farmerContract, token);
        }
      );

    });
  });
};

/**
 * Negotiates a storage contract and adds the shard to the frame
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
FramesRouter.prototype.addShardToFrame = function (req, res, next) {
  const self = this;
  const { Pointer, Frame } = this.storage.models;

  if (Array.isArray(req.body.exclude) && req.body.exclude.length > constants.MAX_BLACKLIST) {
    return next(new errors.BadRequestError('Maximum blacklist length'));
  }

  let bl = Array.isArray(req.body.exclude) ? req.body.exclude : [];

  let audit

  try {
    audit = storj.AuditStream.fromRecords(req.body.challenges, req.body.tree);
  } catch (err) {
    return next(new errors.BadRequestError(err.message));
  }

  let contr

  try {
    contr = new storj.Contract({
      data_size: req.body.size,
      data_hash: req.body.hash,
      store_begin: Date.now(),
      store_end: Date.now() + ms('3650d'),
      audit_count: req.body.challenges.length
    });
  } catch (err) {
    return next(new errors.BadRequestError(err.message));
  }

  log.debug('Requesting contract for frame: %s, shard hash: %s and size: %s',
    req.params.frame, req.body.hash, req.body.size);

  async.parallel([
    (done) => {
      this._selectFarmer(bl, (err, farmer) => {
        if (err) {
          return done(new errors.InternalError(err.message));
        }

        done(null, farmer)
      })
    },
    function checkFrame(done) {
      Frame.findOne({
        _id: req.params.frame,
        user: req.user._id
      }, function (err, _frame) {
        if (err) {
          return done(new errors.InternalError(err.message));
        }

        if (!_frame) {
          done(new errors.NotFoundError('Frame not found'));
        } else {
          done(null, _frame);
        }
      });
    },

  ],(err, [farmer, frame]) => {
    if (err){
      log.error(err)
      return next(err)
    }

    async.parallel([
      (done) => {
        const { address, port } = farmer;
        const farmerUrl = `http://${address}:${port}/upload/link/${req.body.hash}`;

        const { username, password } = self.config.nodes;

        axios.get(farmerUrl, { auth: { username, password } }).then((farmerRes) => {
          
          done(null, farmerRes);
        }).catch(done);

      },
      (done) => {
        this._publishContract(farmer, contr, audit, (err, farmerContact, farmerContract, token) => {
          if (err) {
            return done(new errors.InternalError(err.message));
          }

          done(null, {farmerContact, farmerContract, token});
        });
      },
      function addPointerToFrame(done) {
        let pointerData = {
          index: req.body.index,
          hash: req.body.hash,
          size: req.body.size,
          tree: req.body.tree,
          parity: req.body.parity,
          challenges: req.body.challenges,
          frame: req.params.frame
        };

        Pointer.create(pointerData, function (err, pointer) {
          if (err) {
            return done(new errors.BadRequestError(err.message));
          }

          Frame.findOne({
            _id: frame._id
          }).populate('shards').exec(function (err, frame) {
            if (err) {
              return done(new errors.InternalError(err.message));
            }

            req.user.recordUploadBytes(pointer.size, (err) => {
              if (err) {
                log.warn(
                  'addShardToFrame: unable to save upload bytes %s, ' +
                  'user: %s, reason: %s', pointer.size, req.user.email,
                  err.message
                );
              }
            });

            frame.addShard(pointer, (err) => {
              if (err) {
                return done(new errors.InternalError(err.message));
              }
              done(null);
            });
          });
        });
      },
    ], (err, results) => {
      if (err)
        return next(err)

      res.send({
        hash:req.body.hash,
        token: results[1].token,
        operation: 'PUSH',
        farmer,
        url: results[0].data.result
      });
    })
  }) 
};

/**
 * Destroys the file staging frame if it is not in use by a bucket entry
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
FramesRouter.prototype.destroyFrameById = function (req, res, next) {
  const { BucketEntry, Frame } = this.storage.models;

  BucketEntry.findOne({
    user: req.user._id,
    frame: req.params.frame
  }, function (err, entry) {
    if (err) {
      return next(new errors.InternalError(err.message));
    }

    if (entry) {
      return next(new errors.BadRequestError(
        'Refusing to destroy frame that is referenced by a bucket entry'
      ));
    }

    Frame.findOne({
      user: req.user._id,
      _id: req.params.frame
    }, function (err, frame) {
      if (err) {
        return next(new errors.InternalError(err.message));
      }

      if (!frame) {
        return next(new errors.NotFoundError('Frame not found'));
      }

      frame.remove(function (err) {
        if (err) {
          return next(new errors.InternalError(err.message));
        }

        res.status(204).end();
      });
    });
  });
};

/**
 * Returns the caller's file staging frames
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
FramesRouter.prototype.getFrames = function (req, res, next) {
  const Frame = this.storage.models.Frame;

  Frame.find({ user: req.user._id }).limit(10).exec(function (err, frames) {
    if (err) {
      return next(new errors.InternalError(err.message));
    }

    res.send(frames.map(function (frame) {
      return frame.toObject();
    }));
  });
};

/**
 * Returns the file staging frame by it's ID
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
FramesRouter.prototype.getFrameById = function (req, res, next) {
  const Frame = this.storage.models.Frame;

  Frame.findOne({
    user: req.user._id,
    _id: req.params.frame
  }, function (err, frame) {
    if (err) {
      return next(new errors.InternalError(err.message));
    }

    if (!frame) {
      return next(new errors.NotFoundError('Frame not found'));
    }

    res.send(frame.toObject());
  });
};

function getStorageUsage(storage, user) {
  const Bucket = storage.models.Bucket;

  return new Promise((resolve, reject) => {
    var agg = Bucket.aggregate([
      {
        $match: {
          user: user
        }
      },
      {
        $lookup: {
          from: 'bucketentries',
          localField: '_id',
          foreignField: 'bucket',
          as: 'join1'
        }
      },
      {
        $unwind: {
          path: '$join1'
        }
      },
      {
        $lookup: {
          from: 'frames',
          localField: 'join1.frame',
          foreignField: '_id',
          as: 'join2'
        }
      },
      {
        $unwind: {
          path: '$join2'
        }
      },
      {
        $project: {
          _id: '$join2._id',
          user: '$join2.user',
          size: '$join2.size'
        }
      },
      {
        $group: {
          _id: '$user',
          total: { $sum: '$size' }
        }
      }
    ]).cursor({ batchSize: 1000 }).exec();

    agg.next().then(data => {
      resolve(data);
    }).catch(err => {
      reject({ message: 'Error', reason: err });
    });
  });
}

function getStorageLimit(storage, user) {
  return new Promise((resolve, reject) => {

    storage.models.User.findOne({ _id: user }, function (err, _user) {
      if (err) {
        reject({ error: 'Internal error', statusCode: 500 });
      }

      if (!_user) {
        reject({ error: 'User not found', statusCode: 404 });
      }

      if (_user.maxSpaceBytes === 0) {
        _user.maxSpaceBytes = 1024 * 1024 * 1024 * 2; // 2GB by default.
      }

      resolve({ error: null, statusCode: 200, maxSpaceBytes: _user.maxSpaceBytes });
    });

  });
}

function userHasFreeSpaceLeft(storage, user) {
  return new Promise((resolve) => {
    getStorageLimit(storage, user).then(limit => {
      const maxSpaceBytes = limit.maxSpaceBytes;
      getStorageUsage(storage, user).then(usage => {
        const usedSpaceBytes = usage ? usage.total : 0;
        // If !maxSpaceBytes models are not updated. Consider no limit due to this variable.
        resolve({ canUpload: !maxSpaceBytes ? true : usedSpaceBytes < maxSpaceBytes });
      }).catch(err => {
        resolve({ canUpload: false, error: err.message });
      });

    }).catch(err => {
      resolve({ canUpload: false, error: err.message });
    });
  });
}

FramesRouter.prototype.getStorageUsage = function (req, res) {
  getStorageUsage(this.storage, req.user._id)
    .then(usage => {
      if (!usage) {
        usage = { total: 0 };
      }
      res.status(200).send(usage);
    })
    .catch(() => {
      res.status(400).send({ message: 'Error' });
    });
};

FramesRouter.prototype.getStorageLimit = function (req, res) {
  getStorageLimit(this.storage, req.user._id).then(result => {
    res.status(result.statusCode).send({ maxSpaceBytes: result.maxSpaceBytes });
  }).catch(err => {
    res.status(err.statusCode).send({ error: err.error });
  });
};


/**
 * Export definitions
 * @private
 */
FramesRouter.prototype._definitions = function () {
  /* jshint maxlen: 140 */
  return [
    ['POST', '/frames', this.getLimiter(limiter(1000)), this._verify, this.createFrame],
    ['PUT', '/frames/:frame', this.getLimiter(limiter(this._defaults.shardsPerMinute)), this._verify, this.addShardToFrame],
    ['DELETE', '/frames/:frame', this.getLimiter(limiter(1000)), this._verify, this.destroyFrameById],
    ['GET', '/frames', this.getLimiter(limiter(1000)), this._verify, this.getFrames],
    ['GET', '/frames/:frame', this.getLimiter(limiter(1000)), this._verify, this.getFrameById],
    ['GET', '/limit', this.getLimiter(limiter(1000)), this._verify, this.getStorageLimit]
  ];
};

module.exports = FramesRouter;