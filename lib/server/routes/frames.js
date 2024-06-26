'use strict';

const middleware = require('storj-service-middleware');
const authenticate = middleware.authenticate;
const errors = require('storj-service-error-types');
const Router = require('./index');
const inherits = require('util').inherits;
const limiter = require('../limiter').DEFAULTS;

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
FramesRouter.prototype.getFrames = function (req, res, next) {
  const Frame = this.storage.models.Frame;

  Frame.find({ user: { $in: [req.user.email, req.user._id] } }).limit(10).exec(function (err, frames) {
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
    user: { $in: [req.user.email, req.user._id] },
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

function getStorageLimit(storage, userId) {
  return new Promise((resolve, reject) => {

    storage.models.User.findOne({ uuid: userId }, function (err, _user) {
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

FramesRouter.prototype.getStorageLimit = function (req, res) {
  getStorageLimit(this.storage, req.user.uuid).then(result => {
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
    ['GET', '/frames', this.getLimiter(limiter(1000)), this._verify, this.getFrames],
    ['GET', '/frames/:frame', this.getLimiter(limiter(1000)), this._verify, this.getFrameById],
    ['GET', '/limit', this.getLimiter(limiter(1000)), this._verify, this.getStorageLimit]
  ];
};

module.exports = FramesRouter;
