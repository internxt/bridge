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

async function getStorageUsage(storage, user) {
  const { Frame } = storage.models;

  return Frame.aggregate([
    {
      $match: {
        user,
        locked: true
      }
    },
    {
      $group: {
        _id: '$user',
        total: { $sum: '$size' }
      }
    }
  ]).cursor().exec().next();
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

async function userHasFreeSpaceLeft(storage, user) {
  const { maxSpaceBytes } = await getStorageLimit(storage, user);
  const usage = await getStorageUsage(storage, user);
  const usedSpaceBytes = (usage && usage.total) || 0;

  // If !maxSpaceBytes models are not updated. Consider no limit due to this variable.
  return { canUpload: !maxSpaceBytes ? true : usedSpaceBytes < maxSpaceBytes };
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
    ['DELETE', '/frames/:frame', this.getLimiter(limiter(1000)), this._verify, this.destroyFrameById],
    ['GET', '/frames', this.getLimiter(limiter(1000)), this._verify, this.getFrames],
    ['GET', '/frames/:frame', this.getLimiter(limiter(1000)), this._verify, this.getFrameById],
    ['GET', '/limit', this.getLimiter(limiter(1000)), this._verify, this.getStorageLimit]
  ];
};

module.exports = FramesRouter;
