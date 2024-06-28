'use strict';

const ms = require('ms');
const assert = require('assert');
const async = require('async');
const storj = require('storj-lib');
const middleware = require('storj-service-middleware');
const authenticate = middleware.authenticate;
const tokenauth = middleware.tokenauth;
const publicBucket = middleware.publicBucket;
const log = require('../../logger');
const merge = require('merge');
const errors = require('storj-service-error-types');
const Router = require('./index');
const inherits = require('util').inherits;
const utils = require('../../utils');
const constants = require('../../constants');
const limiter = require('../limiter').DEFAULTS;
const { randomBytes } = require('crypto');
const DELETING_FILE_MESSAGE = require('../queues/messageTypes').DELETING_FILE_MESSAGE;
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const { isHexString } = require('../middleware/farmer-auth');
const axios = require('axios');
const { MongoDBBucketEntriesRepository } = require('../../core/bucketEntries/MongoDBBucketEntriesRepository');
const { BucketsUsecase, BucketEntryNotFoundError, BucketEntryFrameNotFoundError, BucketNotFoundError, BucketForbiddenError, MissingUploadsError, MaxSpaceUsedError, InvalidUploadIndexes, InvalidMultiPartValueError, NoNodeFoundError, EmptyMirrorsError } = require('../../core/buckets/usecase');
const { BucketEntriesUsecase, BucketEntryVersionNotFoundError } = require('../../core/bucketEntries/usecase');
const { MongoDBBucketEntryShardsRepository } = require('../../core/bucketEntryShards/MongoDBBucketEntryShardsRepository');
const { MongoDBMirrorsRepository } = require('../../core/mirrors/MongoDBMirrorsRepository');
const { MongoDBFramesRepository } = require('../../core/frames/MongoDBFramesRepository');
const { MongoDBShardsRepository } = require('../../core/shards/MongoDBShardsRepository');
const { MongoDBBucketsRepository, MongoDBUsersRepository } = require('../../core');
const { MongoDBUploadsRepository } = require('../../core/uploads/MongoDBUploadsRepository');
const { MongoDBPointersRepository } = require('../../core/pointers/MongoDBPointersRepository');
const { ShardsUsecase } = require('../../core/shards/usecase');
const { MongoDBTokensRepository } = require('../../core/tokens/MongoDBTokensRepository');
const { MongoDBContactsRepository } = require('../../core/contacts/MongoDBContactsRepository');

/**
 * Handles endpoints for all bucket and file related operations
 * @constructor
 * @extends {Router}
 */
function BucketsRouter(options) {
  if (!(this instanceof BucketsRouter)) {
    return new BucketsRouter(options);
  }

  Router.apply(this, arguments);

  this._verify = authenticate(this.storage);
  this._isPublic = publicBucket(this.storage);
  this._usetoken = tokenauth(this.storage);
  this.getLimiter = middleware.rateLimiter(options.redis);
  this.CLUSTER = Object.values(options.config.application.CLUSTER || []);
  this.networkQueue = options.networkQueue;

  const bucketEntriesRepository = new MongoDBBucketEntriesRepository(this.storage.models.BucketEntry);
  const bucketEntryShardsRepository = new MongoDBBucketEntryShardsRepository(this.storage.models.BucketEntryShard);
  const mirrorsRepository = new MongoDBMirrorsRepository(this.storage.models.Mirror);
  const framesRepository = new MongoDBFramesRepository(this.storage.models.Frame);
  const shardsRepository = new MongoDBShardsRepository(this.storage.models.Shard);
  const bucketsRepository = new MongoDBBucketsRepository(this.storage.models.Bucket);
  const uploadsRepository = new MongoDBUploadsRepository(this.storage.models.Upload);
  const usersRepository = new MongoDBUsersRepository(this.storage.models.User);
  const pointersRepository = new MongoDBPointersRepository(this.storage.models.Pointer);
  const tokensRepository = new MongoDBTokensRepository(this.storage.models.Token);
  const contactsRepository = new MongoDBContactsRepository(this.storage.models.Contact);

  this.usecase = new BucketsUsecase(
    bucketEntryShardsRepository,
    bucketEntriesRepository,
    mirrorsRepository,
    framesRepository,
    shardsRepository,
    bucketsRepository,
    uploadsRepository,
    usersRepository,
    tokensRepository,
    contactsRepository
  );

  this.shardsUseCase = new ShardsUsecase(
    mirrorsRepository,
    this.networkQueue,
  );

  this.bucketEntriesUsecase = new BucketEntriesUsecase(
    bucketEntriesRepository,
    bucketsRepository,
    framesRepository,
    bucketEntryShardsRepository,
    shardsRepository,
    pointersRepository,
    mirrorsRepository,
    this.shardsUseCase,
    usersRepository
  );
}

inherits(BucketsRouter, Router);

BucketsRouter.prototype._usetokenOrVerify = function (req, res, next) {
  if (req.headers['x-token']) {
    this._usetoken(req, res, next);
  } else {
    // NB: Authenticate middleware is array of rawbody and authenticate
    assert(this._verify.length === 2);
    const rawbody = this._verify[0];
    const authenticate = this._verify[1];
    rawbody(req, res, (err) => {
      if (err) {
        return next(err);
      }
      authenticate(req, res, next);
    });
  }
};

BucketsRouter.prototype._validate = function (req, res, next) {
  if (req.params.id && !utils.isValidObjectId(req.params.id)) {
    return next(new errors.BadRequestError('Bucket id is malformed'));
  }
  if (req.params.file && !utils.isValidObjectId(req.params.file)) {
    return next(new errors.BadRequestError('File id is malformed'));
  }
  next();
};

/**
 * Returns a list of buckets for the user
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
BucketsRouter.prototype.getBuckets = function (req, res, next) {
  let findQuery = { userId: req.user.uuid };
  const startDate = utils.parseTimestamp(req.query.startDate);
  if (startDate) {
    findQuery.created = { $gt: startDate };
  }

  this.storage.models.Bucket
    .find(findQuery)
    .sort({ created: 1 })
    .limit(constants.DEFAULT_MAX_BUCKETS)
    .exec(function (err, buckets) {
      if (err) {
        return next(new errors.InternalError(err.message));
      }

      res.status(200).send(buckets.map(function (bucket) {
        return bucket.toObject();
      }));
    });
};

/**
 * Returns the user's bucket by it's ID
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
BucketsRouter.prototype.getBucketById = function (req, res, next) {
  const Bucket = this.storage.models.Bucket;

  Bucket.findOne({
    _id: req.params.id,
    userId: req.user.uuid
  }, function (err, bucket) {
    if (err) {
      return next(new errors.InternalError(err.message));
    }

    if (!bucket) {
      return next(new errors.NotFoundError('Bucket not found'));
    }

    res.status(200).send(bucket.toObject());
  });
};

/**
 * Creates a new bucket for the user
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
BucketsRouter.prototype.createBucket = function (req, res, next) {
  const Bucket = this.storage.models.Bucket;
  const PublicKey = this.storage.models.PublicKey;

  if (req.body.name && req.body.name.length > constants.MAX_BUCKETNAME) {
    return next(new errors.BadRequestError('Maximum bucket name'));
  }

  if (!Array.isArray(req.body.pubkeys)) {
    req.body.pubkeys = [];
  }

  if (req.pubkey && req.body.pubkeys.indexOf(req.pubkey._id) === -1) {
    req.body.pubkeys.push(req.pubkey._id);
  }

  try {
    for (let k = 0; k < req.body.pubkeys.length; k++) {
      PublicKey.validate(req.body.pubkeys[k]);
    }
  } catch (err) {
    return next(new errors.BadRequestError('Invalid public key supplied'));
  }

  Bucket.create(req.user, req.body, function (err, bucket) {
    if (err) {
      return next(err);
    }

    res.status(201).send(bucket.toObject());
  });
};

/**
 * Destroys the user's bucket by ID
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
BucketsRouter.prototype.destroyBucketById = function (req, res, next) {
  const Bucket = this.storage.models.Bucket;

  if (req.user.configuration && req.user.configuration.disableBucketDeletion) {
    return next(new errors.ConflictError('This user has bucket deletion disabled'));
  }

  Bucket.findOne({ _id: req.params.id, userId: req.user.uuid }, (err, bucket) => {
    if (err) {
      return next(new errors.InternalError(err.message));
    }

    if (!bucket) {
      return next(new errors.NotFoundError('Bucket not found'));
    }

    bucket.remove((err) => {
      if (err) {
        return next(new errors.InternalError(err.message));
      }
    });
    res.status(204).end();
  });
};

/**
 * Updates the given bucket's properties
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
BucketsRouter.prototype.updateBucketById = function (req, res, next) {
  const PublicKey = this.storage.models.PublicKey;
  const Bucket = this.storage.models.Bucket;

  Bucket.findOne({
    _id: req.params.id,
    userId: req.user.uuid
  }, (err, bucket) => {
    if (err) {
      return next(new errors.InternalError(err.message));
    }

    if (!bucket) {
      return next(new errors.NotFoundError('Bucket not found'));
    }

    const allowed = ['pubkeys', 'encryptionKey', 'publicPermissions'];

    for (let prop in req.body) {
      if (allowed.indexOf(prop) !== -1) {
        bucket[prop] = req.body[prop];
      }
    }

    try {
      for (let k = 0; k < bucket.pubkeys.length; k++) {
        PublicKey.validate(bucket.pubkeys[k]);
      }
    } catch (err) {
      return next(new errors.BadRequestError('Invalid public key supplied'));
    }

    bucket.save((err) => {
      if (err) {
        return next(new errors.InternalError(err.message));
      }

      res.status(200).send(bucket.toObject());
    });
  });
};

/**
 * Loads the bucket for an authorized but unregistered user
 * @private
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
BucketsRouter.prototype._getBucketUnregistered = function (req, res, next) {
  const self = this;
  const Bucket = this.storage.models.Bucket;

  let query = { _id: req.params.id };
  let strategy = authenticate._detectStrategy(req);
  let rawBody = self._verify[0];
  let checkAuth = self._verify[1];
  let isPublicBucket = self._isPublic;

  if (req.token) {
    if (req.token.bucket.toString() !== req.params.id) {
      return next(new errors.NotAuthorizedError());
    }

    query = { _id: req.params.id };
  }

  function _checkAuthIfNotPublic(req, res, next) {
    isPublicBucket(req, res, function (err) {
      if (err) {
        return checkAuth(req, res, next);
      }

      next(null);
    });
  }

  async.series([
    rawBody.bind(null, req, res),
    _checkAuthIfNotPublic.bind(null, req, res)
  ], (err) => {
    if (err) {
      if (strategy === 'ECDSA' && authenticate._verifySignature(req)) {
        query.pubkeys = { $in: [req.header('x-pubkey')] };
      }

      if (!req.token) {
        return next(err);
      }
    }

    if (req.user) {
      query.userId = req.user.uuid;
    }

    Bucket.findOne(query, function (err, bucket) {
      if (err) {
        return next(new errors.InternalError(err.message));
      }

      if (!bucket) {
        return next(new errors.NotFoundError('Bucket not found'));
      }

      next(null, bucket);
    });
  });
};
/**
 * @callback BucketsRouter~_getBucketUnregisteredCallback
 * @param {Error|null} [error]
 * @param {Bucket} bucket
 */

/**
 * Creates a bucket operation token
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
BucketsRouter.prototype.createBucketToken = function (req, res, next) {
  const { Token, BucketEntry, Bucket } = this.storage.models;

  Bucket.findOne({
    _id: req.params.id,
    userId: req.user.uuid
  }, function (err, bucket) {
    if (err) {
      return next(err);
    }

    if (!bucket) {
      return next(new errors.NotFoundError('Bucket not found'));
    }

    Token.create(bucket, req.body.operation, function (err, token) {
      if (err) {
        return next(new errors.InternalError(err.message));
      }

      const tokenObject = token.toObject();
      tokenObject.encryptionKey = bucket.encryptionKey;

      const file = req.body.file;
      if (!file || req.body.operation !== 'PULL') {
        res.status(201).send(tokenObject);

        return;
      }

      BucketEntry.findOne({
        _id: file,
        bucket: bucket._id
      }).populate('frame').exec(function (err, bucketEntry) {
        if (err) {
          return next(err);
        }
        if (!bucketEntry) {
          return next(new errors.NotFoundError('Bucket entry not found'));
        }
        tokenObject.mimetype = bucketEntry.mimetype;
        tokenObject.size = (bucketEntry.frame && bucketEntry.frame.size) || bucketEntry.size;
        res.status(201).send(tokenObject);
      });
    });
  });
};

/**
 * Returns the bucket by ID
 * @param {String|ObjectId} bucketId - The unique _id for the bucket
 * @param {String} [userId] - User's uuid
 * @param {BucketsRouter~_getBucketByIdCallback}
 */
BucketsRouter.prototype._getBucketById = function (bucketId, userId, callback) {
  const query = { _id: bucketId };

  if (typeof userId === 'function') {
    callback = userId;
    userId = null;
  }

  if (userId) {
    query.userId = userId;
  }

  this.storage.models.Bucket.findOne(query, function (err, bucket) {
    if (err) {
      return callback(new errors.InternalError(err.message));
    }

    if (!bucket) {
      return callback(new errors.NotFoundError('Bucket not found'));
    }

    callback(null, bucket);
  });
};
/**
 * @callback BucketsRouter~_getBucketByIdCallback
 * @param {Error|null} error
 * @param {Bucket} bucket
 */

/**
 * Returns the bucket entry by ID
 * @param {String|ObjectId} bucketId - The unique _id for the bucket
 * @param {String} bucketEntryId - The unique _id for the bucket entry
 * @param {BucketsRouter~_getBucketEntryByIdCallback}
 */
BucketsRouter.prototype.getBucketEntryById = function (bucketId, entryId, done) {
  this.storage.models.BucketEntry.findOne({
    _id: entryId,
    bucket: bucketId
  }).populate('frame').exec(function (err, entry) {
    if (err) {
      return done(new errors.InternalError(err.message));
    }

    if (!entry) {
      return done(new errors.NotFoundError('Entry not found'));
    }

    done(null, entry);
  });
};
/**
 * @callback BucketsRouter~_getBucketEntryByIdCallback
 * @param {Error|null} error
 * @param {BucketEntry} bucketEntry
 */

/**
 * Returns the pointers for a given bucket entry
 * @param {BucketEntry} bucketEntry
 * @param {BucketsRouter~getPointersForEntryCallback}
 */
BucketsRouter.prototype.getPointersForEntry = function (bucketEntry, next) {
  this.storage.models.Pointer.find({
    _id: { $in: bucketEntry.frame.shards }
  }, function (err, pointers) {
    if (err) {
      return next(new errors.InternalError(err.message));
    }

    next(null, pointers);
  });
};
/**
 * @callback BucketsRouter~getPointersForEntryCallback
 * @param {Error|null} error
 * @param {Pointers[]} shardPointers
 */

/**
 * Returns possible mirroring candidates for a group of pointers
 * @param {Pointer} shardPointer
 * @param {BucketsRouter~getMirrorsForPointersCallback}
 */
BucketsRouter.prototype.getMirrorsForPointers = function (pointers, callback) {
  const self = this;
  const hashes = pointers.map(function (pointer) {
    return pointer.hash;
  });

  async.map(hashes, function (hash, done) {
    self.storage.models.Mirror.find(
      { shardHash: hash, isEstablished: false },
      done
    );
  }, callback);
};
/**
 * @callback BucketsRouter~getMirrorsForPointersCallback
 * @param {Error|null} error
 * @param {Array.<Array.<Mirror>>} mirrors
 */

/**
 * Retreives a contact by it's Node ID
 * @param {String} nodeId - Farmers public key hash
 * @param {BucketsRouter~getContactByIdCallback}
 */
BucketsRouter.prototype.getContactById = function (nodeId, callback) {
  this.storage.models.Contact.findOne({ _id: nodeId }, function (err, contact) {
    if (err) {
      return callback(new errors.InternalError(err.message));
    }

    if (!contact) {
      return callback(new errors.NotFoundError('Contact not found'));
    }

    callback(null, contact);
  });
};
/**
 * @callback BucketsRouter~getContactByIdCallback
 * @param {Error|null} error
 * @param {Contact} contact
 */

/**
 * @callback BucketsRouter~getMirrorAuthorizationCallback
 * @param {Error|null} error
 * @param {Object} mirrorAuth
 * @param {Mirror} mirrorAuth.mirror
 * @param {DataChannelPointer} mirrorAuth.source
 * @param {Contact} mirrorAuth.destination
 */

/**
 * @callback BucketsRouter~getMirroringTokensCallback
 * @param {Error|null} error
 * @param {Array[]}  tokenMap
 * @param {Mirror} tokenMap.mirror
 * @param {DataChannelPointer} tokenMap.source
 * @param {Contact} tokenMap.destination
 */

/**
 * @callback BucketsRouter~createMirrorsFromTokenMapCallback
 * @param {Error|null} error
 * @param {Array.<Array.<Contact>>} mirroredNodes
 */

/**
 * Lists all the established mirrors for a file
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
BucketsRouter.prototype.listMirrorsForFile = function (req, res, next) {
  const self = this;

  function _getFrameForFile(fileId, bucket, callback) {
    self.storage.models.BucketEntry.findOne({
      bucket: bucket.id,
      _id: fileId
    }).populate('frame').exec(function (err, bucketEntry) {
      if (err) {
        return next(err);
      }

      if (!bucketEntry) {
        return next(new errors.NotFoundError('File not found'));
      }

      callback(null, bucketEntry.frame);
    });
  }

  function _getHashesFromFrame(frame, callback) {
    self.storage.models.Pointer.find({
      _id: { $in: frame.shards }
    }, function (err, pointers) {
      if (err) {
        return next(err);
      }

      callback(null, pointers.map((p) => p.hash));
    });
  }

  function _getMirrorsFromHashes(hashes, callback) {
    async.map(hashes, function (hash, next) {
      self.storage.models.Shard.findOne({
        hash: hash
      }).exec((err, shard) => {
        if (err) {
          return next(err);
        }

        let result = { established: [], available: [] };
        let { established } = result;

        if (!shard) {
          return next(null, result);
        }

        // NOTE: Available is no longer used here as available
        // mirrors are stored in TTL collection. The contact field
        // will also not be populated, the farmer_id will be included
        // if there are additional details needed.

        for (let i = 0; i < shard.contracts.length; i++) {
          let contract = shard.contracts[i].contract;
          established.push({
            shardHash: shard.hash,
            contract: {
              farmer_id: contract.farmer_id,
              data_size: contract.data_size,
              store_begin: contract.store_begin,
              store_end: contract.store_end
            }
          });
        }

        next(null, result);
      });
    }, callback);
  }

  async.waterfall([
    this._getBucketById.bind(this, req.params.id, req.user.uuid),
    _getFrameForFile.bind(this, req.params.file),
    _getHashesFromFrame,
    _getMirrorsFromHashes
  ], (err, result) => {
    if (err) {
      return next(err);
    }

    res.status(200).send(result);
  });
};

/**
 * Fetches a RETRIEVE token from a farmer for the given shard
 * @private
 * @param {Pointer} shardPointer - Pointer document to retrieve
 * @param {Object} options
 * @param {Array} options.excludeFarmers - Blacklist array of Node IDs
 * @param {BucketsRouter~_getRetrievalTokenCallback}
 */
BucketsRouter.prototype._getRetrievalToken = function (sPointer, opts, done) {
  const self = this;

  log.debug('getting retrieval token for %j', sPointer);
  this.contracts.load(sPointer.hash, function (err, item) {
    if (err) {
      return done(err);
    }

    let farmers = Object.keys(item.contracts).filter((nodeID) => {
      return opts.excludeFarmers.indexOf(nodeID) === -1;
    });

    self.storage.models.Contact.find({
      _id: { $in: farmers }
    }).exec((err, contacts) => {
      if (err) {
        return done(err);
      }

      let currentTime = Date.now();
      let finalHandlerAlreadyCalled = false;
      let { farmerTimeoutIgnore } = self.config.application;
      let farmerTimeoutMs = ms(farmerTimeoutIgnore || '10m');
      let options = contacts
        .filter((c) => {
          if (!c.lastTimeout || c.lastSeen > c.lastTimeout) {
            return true;
          }

          return currentTime - c.lastTimeout > farmerTimeoutMs;
        })
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .map((c) => ({ contact: storj.Contact(c), pointer: null }));

      let retrievalTimeout = setTimeout(() => {
        handleResults(new errors.ServiceUnavailableError('Timed out waiting for pointers'));
        finalHandlerAlreadyCalled = true;
      }, 20000);

      function handleResults(err, result) {
        if (finalHandlerAlreadyCalled) {
          return;
        }

        finalHandlerAlreadyCalled = true;
        clearTimeout(retrievalTimeout);

        let data = {
          index: sPointer.index,
          hash: sPointer.hash,
          size: sPointer.size,
          parity: sPointer.parity
        };

        // We want to return the result even if there was a failure
        // to retrieve the token from the farmer, it will just be missing
        // a token and farmer contact.
        if (err || !result) {
          log.warn('Failed to get retrieval token, %s', err ? err.message : 'No farmers responded');
        } else {
          data.token = result.pointer.token;
          data.farmer = result.pointer.farmer;
          data.operation = 'PULL';
        }
        done(null, data);
      }

      async.detectLimit(
        options,
        6,
        self._requestRetrievalPointer.bind(self, item),
        handleResults
      );
    });
  });
};
/**
 * @callback BucketsRouter~_getRetrievalTokenCallback
 * @param {Error|null} [error]
 * @param {Object} dataChannelPointer
 * @param {String} dataChannelPointer.token
 * @param {String} dataChannelPointer.hash
 * @param {Contact} dataChannelPointer.farmer
 * @param {String} dataChannelPointer.operation
 * @param {Number} dataChannelPointer.size
 */

/**
 * Requests a retrieval pointer from the first farmer in the given list
 * @private
 * @param {StorageItem} item - Loaded storage item data
 * @param {Object} opts
 * @param {Contact} opts.contact
 * @param {Pointer|null} opts.pointer
 * @param {BucketsRouter~_requestRetrievalPointerCallback}
 */
BucketsRouter.prototype._requestRetrievalPointer = function (item, meta, done) {

  meta.pointer = {
    token: randomBytes(16).toString('hex'),
    farmer: meta.contact
  };

  return done(null, true);
};

/**
 * @callback BucketsRouter~_requestRetrievalPointerCallback
 * @param {Error|null} [error]
 * @param {Object} [dataChannelPointer]
 * @param {String} [dataChannelPointer.token]
 * @param {String} [dataChannelPointer.hash]
 * @param {Contact} [dataChannelPointer.farmer]
 * @param {String} [dataChannelPointer.operation]
 */

/**
 * Resolves shard pointer from a populated bucket entry
 * @private
 * @param {BucketEntry} entry - Populated bucket entry
 * @param {Object} options
 * @param {Number} options.skip - Skip returned entries
 * @param {Number} options.limit - Limit returned entries
 * @param {String[]} options.excludeFarmers - Blackisted NodeIDs
 * @param {BucketsRouter~_getPointersFromEntryCallback}
 */
BucketsRouter.prototype._getPointersFromEntry = function (entry, opts, user, done) {
  try {
    const self = this;
    const { Pointer } = this.storage.models;

    let pQuery = {
      _id: { $in: entry.frame.shards },
      index: {
        $gte: parseInt(opts.skip) || 0,
        $lt: parseInt(opts.skip) + parseInt(opts.limit) || 6
      }
    };
    let pSort = { index: 1 };
    let cursor = Pointer.find(pQuery).sort(pSort);

    cursor.exec(function (err, pointers) {
      if (err) {
        return done(new errors.InternalError(err.message));
      }

      async.mapLimit(pointers, 10, function (sPointer, next) {
        self._getRetrievalToken(sPointer, {
          excludeFarmers: opts.excludeFarmers
        }, next);
      }, function (err, results) {
        if (err) {
          return done(new errors.InternalError(err.message));
        }

        done(null, results);
      });
    });
  } catch (err) {
    log.error('Error getting pointers from entry: %s. Entry: %s', err.message, entry._id);
    done(err);
  }
};

/**
 * @callback BucketsRouter~_getPointersFromEntryCallback
 * @param {Error|null} [error]
 * @param {Object[]} pointers
 */

/**
 * Negotiates retrieval tokens from the farmers storing the shards
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
BucketsRouter.prototype.getFile = function (req, res, next) {
  const self = this;
  const { Bucket, BucketEntry, User } = self.storage.models;

  const query = { _id: req.params.id };

  if (req.user) {
    query.userId = req.user.uuid;
  } else {
    if (req.params.id !== req.token.bucket.toString()) {
      return next(new errors.NotAuthorizedError());
    }
  }

  Bucket.findOne(query, function (err, bucket) {
    if (err) {
      return next(new errors.InternalError(err.message));
    }

    if (!bucket) {
      return next(new errors.NotFoundError('Bucket not found'));
    }

    User.findOne({
      uuid: bucket.toObject().userId
    }, function (err, user) {
      if (err) {
        return next(new errors.InternalError(err.message));
      }

      if (!user) {
        return next(new errors.NotFoundError('User not found for bucket'));
      }

      BucketEntry.findOne({
        _id: req.params.file,
        bucket: bucket._id
      }).populate('frame').exec(function (err, entry) {
        if (err) {
          return next(new errors.InternalError(err.message));
        }

        if (!entry) {
          return next(new errors.NotFoundError('File not found'));
        }

        self._getPointersFromEntry(entry, {
          skip: req.query.skip,
          limit: req.query.limit,
          excludeFarmers: req.query.exclude ? req.query.exclude.split(',') : []
        }, user, function (err, result) {
          if (err) {
            return next(err);
          }

          Promise.all(result.map(r => {
            const { hash, farmer } = r;

            if (!farmer || !farmer.nodeID || !farmer.port || !farmer.address) {
              return r;
            }

            const { address, port } = farmer;
            const farmerUrl = `http://${address}:${port}/download/link/${hash}`;
            const headers = { headers: { 'X-TOKEN': r.token } };

            return axios.get(farmerUrl, headers).then(res => ({ ...r, url: res.data.result }));
          })).then((mirrors) => {
            res.send(mirrors);
          }).catch((err) => {
            next(err);
          });
        });
      });
    });
  });
};

BucketsRouter.prototype.getFiles = async function (req, res, next) {
  try {
    if (!req.query.fileIds) {
      return next(new errors.BadRequestError('Fileids query parameter must be defined'));
    }

    const fileIdList = req.query.fileIds.split(',');
    const bucketId = req.params.id;

    const list = await this.storage.models.BucketEntry.find({ _id: { $in: fileIdList }, bucket: bucketId }).populate({ path: 'frame', populate:{ path: 'shards' } }).exec();

    const v2Files = list.filter(f => f.version && f.version === 2);
    const v1Files = list.filter(f => !f.version || f.version === 1);

    const getFilesPromises = [];

    if (v1Files.length > 0) {
      getFilesPromises.push((async () => {
        const hashes = v1Files.map(entry => entry.frame.shards[0].hash);
        const indexes = v1Files.map(entry => entry.index);

        const shard = await this.storage.models.Shard.findOne({ hash: hashes[0] });

        const farmer = await this.storage.models.Contact.findById(shard.contracts[0].nodeID);

        const { address, port } = farmer;

        const farmerUrl = `http://${address}:${port}/download/links?hashes=${hashes.join(',')}`;
        const headers = { headers: { 'X-TOKEN': randomBytes(20).toString('hex') } };
        const linksResponse = await axios.get(farmerUrl, headers);

        const links = linksResponse.data;

        return v1Files.map((f) => {
          const i = v1Files.findIndex((entry) => entry._id.toString() === f.id);

          return { fileId: f.id, link: links[i], index: indexes[i] };
        });
      })());
    }

    if (v2Files.length > 0) {
      getFilesPromises.push(this.usecase.getFileLinks(v2Files.map(f => f._id)));
    }

    const getFilesResponses = await Promise.all(getFilesPromises);
    const links = getFilesResponses.reduce((acumm, links) => acumm.concat(links), []);
    const sortedLinks = fileIdList.map((fId) => links.find(fL => fL.fileId === fId.toString()));

    return res.json(sortedLinks);
  } catch (err) {
    log.error(`${err.message} while getting download links from the farmer, ids: ${req.query.fileIds}`);

    return next(new errors.InternalError('Internal server error'));
  }
};

/**
 * Removes the file pointer from the bucket
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
//eslint-disable-next-line complexity
BucketsRouter.prototype.removeFile = async function (req, res, next) {
  const {
    params: {
      id: bucketId,
      file: fileId
    },
    user
  } = req;
  if (!bucketId || !fileId) {
    return next(new errors.BadRequestError('Missing parameters'));
  }

  if (!user) {
    return next(new errors.ForbiddenError('Unauthenticated'));
  }

  try {
    const userId = user.uuid;

    await this.bucketEntriesUsecase.removeFileFromUser(
      bucketId,
      fileId,
      userId
    );

    res.status(204).end();
  } catch (err) {
    if (err instanceof BucketNotFoundError) {
      return next(new errors.NotFoundError(err.message));
    }

    if (err instanceof BucketForbiddenError) {
      return next(new errors.ForbiddenError(err.message));
    }

    if (err instanceof BucketEntryNotFoundError) {
      return next(new errors.NotFoundError(err.message));
    }

    if (err instanceof BucketEntryVersionNotFoundError) {
      return next(new errors.InternalError(err.message));
    }

    log.error(
      'deleteFile/error removing file %s: %s. %s',
      fileId,
      err.message,
      err.stack || 'NO STACK'
    );

    return next(new errors.InternalError());
  }
};

BucketsRouter.prototype.deletePointers = async function (pointers) {
  const { Mirror } = this.storage.models;

  for (const pointer of pointers) {
    const mirrors = await Mirror.find({ shardHash: pointer.hash }).populate('contact').exec();
    const stillExistentMirrors = mirrors.filter((mirror) => {
      return mirror.contact && mirror.contact.address && mirror.contact.port;
    });

    const hash = pointer.hash;
    const pointerId = pointer._id;
    const shard = pointer.shard;

    for (const mirror of stillExistentMirrors) {
      const { address, port } = mirror.contact;

      const url = `http://${address}:${port}/shards/${hash}`;

      this.networkQueue.enqueueMessage({
        type: DELETING_FILE_MESSAGE,
        payload: { key: hash, hash, url }
      }, (err) => {
        if (err) {
          log.error(
            'deletePointers: Error enqueueing pointer %s shard %s deletion task: %s',
            pointerId,
            shard,
            err.message
          );
        }
      });
    }

    pointer.remove().catch((err) => {
      log.error('deletePointers: Error removing pointer %s: %s', pointerId, err.message);
    });
  }
};

BucketsRouter.prototype.getFileInfo = function (req, res, next) {
  this._getBucketUnregistered(req, res, (err, bucket) => {
    if (err) {
      return next(err);
    }

    let partSize = req.query.partSize;

    if (partSize) {
      partSize = parseInt(req.query.partSize || '0');

      if (!partSize) {
        return next(new errors.BadRequestError('Invalid "partSize" query parameter'));
      }
    }

    this.usecase.getFileInfo(bucket._id, req.params.file, partSize).then((fileInfo) => {
      return res.status(200).send(fileInfo);
    }).catch((err) => {
      if (err instanceof BucketEntryNotFoundError || err instanceof BucketEntryFrameNotFoundError) {
        return next(new errors.NotFoundError(err.message));
      }

      if (err instanceof EmptyMirrorsError) {
        log.error('getFileInfo: Missing mirrors for file %s: %s. %s', req.params.file, err.message, err.stack);

        return next(new errors.InternalError(err.message));
      }

      log.error('getFileInfo: Error for file %s: %s. %s', req.params.file, err.message, err.stack);

      return next(new errors.InternalError(err.message));
    });
  });
};

//eslint-disable-next-line complexity
BucketsRouter.prototype.startUpload = async function (req, res, next) {
  const bucketId = req.params.id;

  if (!req.body.uploads) {
    return next(new errors.BadRequestError('Missing "uploads" field'));
  }

  const { uploads } = req.body;

  if (!Array.isArray(uploads)) {
    return next(new errors.BadRequestError('Uploads is not an array'));
  }

  for (const { index, size } of uploads) {
    if (typeof size !== 'number' || size < 0) {
      return next(new errors.BadRequestError('Invalid size'));
    }

    if (typeof index !== 'number' || index < 0) {
      return next(new errors.BadRequestError('Invalid index'));
    }
  }

  const multiparts = parseInt(req.query.multiparts || 1);
  if (!Number.isInteger(multiparts) || multiparts < 1) {
    return next(new errors.BadRequestError('Invalid multiparts value'));
  }

  const { username, password } = this.config.nodes;
  const auth = { username, password };

  try {
    const uploadsResult = await this.usecase.startUpload(
      req.user.uuid,
      bucketId,
      this.CLUSTER,
      uploads,
      auth,
      multiparts
    );

    return res.status(200).send({ uploads: uploadsResult });
  } catch (err) {
    if (err instanceof BucketNotFoundError) {
      return next(new errors.NotFoundError(err.message));
    }

    if (err instanceof BucketForbiddenError) {
      return next(new errors.ForbiddenError(err.message));
    }

    if (err instanceof MissingUploadsError) {
      return next(new errors.ConflictError(err.message));
    }

    if (err instanceof MaxSpaceUsedError) {
      return next(new errors.TransferRateError(err.message));
    }

    if (err instanceof InvalidUploadIndexes) {
      return next(new errors.ConflictError(err.message));
    }

    if (err instanceof InvalidMultiPartValueError) {
      return next(new errors.BadRequestError(err.message));
    }

    if (err instanceof NoNodeFoundError) {
      return next(new errors.InternalError(err.message));
    }

    log.error('startUpload: Error for bucket %s: for user: %s %s. %s', bucketId, req.user.uuid, err.message, err.stack);

    return next(new errors.InternalError());
  }
};

// eslint-disable-next-line complexity
BucketsRouter.prototype.finishUpload = async function (req, res, next) {
  const bucketId = req.params.id;

  if (!req.body.index || !req.body.shards) {
    return next(new errors.BadRequestError('Missing parameters'));
  }

  const { index, shards } = req.body;

  if (!isHexString(index) || index.length !== 64) {
    return next(new errors.BadRequestError('Invalid index'));
  }

  if (!Array.isArray(shards)) {
    return next(new errors.BadRequestError('Shards is not an array'));
  }

  for (const { uuid, hash, UploadId, parts } of shards) {
    if (!uuidValidate(uuid)) {
      return next(new errors.BadRequestError('Invalid UUID'));
    }
    if (!hash) {
      return next(new errors.BadRequestError('Missing hash'));
    }
    if (UploadId && !parts) {
      return next(new errors.BadRequestError('For multipart: must provide also an array of parts for this upload'));
    }
    if (parts && !UploadId) {
      return next(new errors.BadRequestError('For multipart: must provide also the UploadId for this upload'));
    }
  }

  const { username, password } = this.config.nodes;
  const auth = { username, password };

  try {
    const bucketEntry = await this.usecase.completeUpload(
      req.user.uuid,
      bucketId,
      index,
      shards,
      auth
    );

    res.status(200).send(bucketEntry);
  } catch (err) {
    if (err instanceof BucketNotFoundError) {
      return next(new errors.NotFoundError(err.message));
    }

    if (err instanceof BucketForbiddenError) {
      return next(new errors.ForbiddenError(err.message));
    }

    if (err instanceof MissingUploadsError) {
      return next(new errors.ConflictError(err.message));
    }

    if (err instanceof MaxSpaceUsedError) {
      return next(new errors.TransferRateError(err.message));
    }

    return next(new errors.InternalError(err.message));
  }
};

BucketsRouter.prototype.getDownloadLinks = async function (req, res, next) {
  const { id:bucketId, file:fileId } = req.params;
  const { BucketEntry, BucketEntryShard, Shard, Mirror } = this.storage.models;

  if (!bucketId) {
    return next(new errors.BadRequestError('No bucket id'));
  }

  if (!fileId) {
    return next(new errors.BadRequestError('No file id'));
  }

  const bucketEntry = await BucketEntry.findOne({ _id: fileId, bucket: bucketId });

  if (!bucketEntry) {
    return next(new errors.NotFoundError('File not found'));
  }

  const bucketEntryShards = await BucketEntryShard.find({ bucketEntry: bucketEntry._id }).sort({ index: 1 }).exec();
  const shards = await Shard.find({ _id: { $in: bucketEntryShards.map(b => b.shard) } });
  const mirrors = await Mirror.find({ shardHash: { $in: shards.map(s => s.hash) } })
    .populate('contact')
    .exec();

  const response = [];

  for (const mirror of mirrors) {
    const { address, port } = mirror.contact;
    const shard = shards.find(s => s.hash === mirror.shardHash);
    const farmerUrl = `http://${address}:${port}/v2/download/link/${shard.uuid}`;
    const headers = { headers: { 'X-TOKEN': randomBytes(20).toString('hex') } };

    await axios.get(farmerUrl, headers).then(res => {
      response.push({
        index: shard.index,
        size: shard.size,
        hash: shard.hash,
        url: res.data.result,
      });
    });
  }

  res.status(200).send({
    bucket: bucketId,
    index: bucketEntry.index,
    created: bucketEntry.created,
    shards: response
  });
};

/**
 * Export definitions
 * @private
 */
BucketsRouter.prototype._definitions = function () {
  /* jshint maxlen: 140 */
  return [
    ['GET', '/buckets', this.getLimiter(limiter(1000)), this._verify, this.getBuckets],
    ['POST', '/buckets', this.getLimiter(limiter(1000)), this._verify, this.createBucket],
    ['DELETE', '/buckets/:id', this.getLimiter(limiter(1000)), this._validate, this._verify, this.destroyBucketById],
    ['PATCH', '/buckets/:id', this.getLimiter(limiter(1000)), this._validate, this._verify, this.updateBucketById],
    ['POST', '/buckets/:id/tokens', this.getLimiter(limiter(1000)), this._validate, this._verify, this.createBucketToken],
    ['GET', '/buckets/:id/files/:file', this.getLimiter(limiter(1000)), this._validate, this._usetokenOrVerify, this.getFile],
    ['GET', '/buckets/:id/bulk-files', this.getLimiter(limiter(1000)), this._validate, this._usetokenOrVerify, this.getFiles],
    ['DELETE', '/buckets/:id/files/:file', this.getLimiter(limiter(1000)), this._validate, this._verify, this.removeFile],
    ['GET', '/buckets/:id/files/:file/info', this.getLimiter(limiter(1000)), this._validate, this._usetokenOrVerify, this.getFileInfo],
    ['GET', '/buckets/:id/files/:file/mirrors', this.getLimiter(limiter(1000)), this._validate, this._verify, this.listMirrorsForFile],
    ['POST', '/v2/buckets/:id/files/start', this.getLimiter(limiter(1000)), this._validate, this._verify, this.startUpload],
    ['POST', '/v2/buckets/:id/files/finish', this.getLimiter(limiter(1000)), this._validate, this._verify, this.finishUpload],
    ['GET', '/v2/buckets/:id/files/:file/mirrors', this.getLimiter(limiter(1000)), this._validate, this._verify, this.getDownloadLinks],
  ];
};

module.exports = BucketsRouter;
