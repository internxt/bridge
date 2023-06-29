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
 * Destroys the file staging frame if it is not in use by a bucket entry
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
FramesRouter.prototype.destroyFrameById = function (req, res, next) {
  const { BucketEntry, Frame } = this.storage.models;

  BucketEntry.findOne({
    user: { $in: [req.user.email, req.user._id] },
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
      user: { $in: [req.user.email, req.user._id] },
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
  ];
};

module.exports = FramesRouter;
