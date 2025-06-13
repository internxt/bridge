'use strict';

const middleware = require('storj-service-middleware');
const authenticate = middleware.authenticate;
const errors = require('storj-service-error-types');
const Router = require('./index');
const inherits = require('util').inherits;
const limiter = require('../limiter').DEFAULTS;
const log = require('../../logger');

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
 * Returns the caller's file staging frames
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
FramesRouter.prototype.getFrames = async function (req, res, next) {
  const Frame = this.storage.models.Frame;
  try {
    const frames = await Frame.find({ user: { $in: [req.user.email, req.user._id] } }).limit(10).exec();

    return res.send(frames.map(function (frame) {
      return frame.toObject();
    }));
  } catch (err) {
    return next(new errors.InternalError(err.message));
  }
};

/**
 * Returns the file staging frame by it's ID
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
FramesRouter.prototype.getFrameById = async function (req, res, next) {
  const Frame = this.storage.models.Frame;
  try {

    const frame = await Frame.findOne({
      user: { $in: [req.user.email, req.user._id] },
      _id: req.params.frame
    });

    if (!frame) {
      return next(new errors.NotFoundError('Frame not found'));
    }

    return res.send(frame.toObject());
  } catch (err) {
    return next(new errors.InternalError(err.message));
  }
};

async function getStorageLimit(storage, userId) {
  const user = await storage.models.User.findOne({ uuid: userId });

  if (!user) {
    return { error: 'User not found', statusCode: 404 };
  }

  if (user.maxSpaceBytes === 0) {
    user.maxSpaceBytes = 1024 * 1024 * 1024 * 2; // 2GB by default.
  }

  return {
    error: null,
    statusCode: 200,
    maxSpaceBytes: user.maxSpaceBytes
  };
}

FramesRouter.prototype.getStorageLimit = function (req, res) {
  getStorageLimit(this.storage, req.user.uuid).then(result => {
    if (result.error) {
      res.status(result.statusCode).send({ error: result.error });
    } else {
      res.status(result.statusCode).send({ maxSpaceBytes: result.maxSpaceBytes });
    }
  }).catch(err => {
    log.error(`[FRAMES/LIMIT] Error in getStorageLimit: ${JSON.stringify({ err: err.message, stack: err.stack })}`);
    res.status(500).send({ error: 'Internal server error' });
  });
};

/**
 * Export definitions
 * @private
 */
FramesRouter.prototype._definitions = function () {
  /* jshint maxlen: 140 */
  return [
    ['GET', '/frames', this.getLimiter(limiter(1000)), this._verify, this.getFrames],
    ['GET', '/frames/:frame', this.getLimiter(limiter(1000)), this._verify, this.getFrameById],
    ['GET', '/limit', this.getLimiter(limiter(1000)), this._verify, this.getStorageLimit]
  ];
};

module.exports = FramesRouter;
