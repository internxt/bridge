'use strict';

const Router = require('./index');
const rawbody = require('../middleware/raw-body');
const log = require('../../logger');
const errors = require('../error-types');
const inherits = require('util').inherits;
const authenticate = require('../middleware/authenticate');
const crypto = require('crypto');
const limiter = require('../limiter').DEFAULTS;
const rateLimiter = require('../middleware/rate-limiter');
const url = require('url');
const sendGridMail = require('@sendgrid/mail');

/**
 * Handles endpoints for all user related operations
 * @constructor
 * @extends {Router}
 */
function UsersRouter(options) {
  if (!(this instanceof UsersRouter)) {
    return new UsersRouter(options);
  }

  Router.apply(this, arguments);

  this._verify = authenticate({ User: this.storage.models.User, PublicKey: this.storage.models.PublicKey, UserNonce: this.storage.models.UserNonce });
  this.getLimiter = rateLimiter(options.redis);
}

inherits(UsersRouter, Router);

function validateRedirectUrl(targetUrl) {
  try {
    const parsedUrl = url.parse(targetUrl);

    return !!parsedUrl.host.match(/\.internxt\.com$/);
  } catch {
    return false;
  }
}

/**
 * Sends a user activation email
 * @private
 */
UsersRouter.prototype._dispatchActivationEmail = function (user, redir, cb) {
  // let self = this;
  // let profile = self.config.server.public || self.config.server;
  // let host = profile.host;
  let callback = cb || (() => {});
  /*
  let port = [443, 80].indexOf(profile.port) === -1 ?
    ':' + profile.port :
    '';
  let proto = self.config.server.ssl &&
    self.config.server.ssl.cert &&
    self.config.server.ssl.key ?
    'https:' :
    'http:';
  */

  if (!validateRedirectUrl(redir)) {
    redir = null;
  }

  /*
  self.mailer.dispatchSendGrid(user.email, 'confirm', {
    token: user.activator,
    redirect: redir,
    url: proto + '//' + host + port
  }, function (err) {
    if (err) {
      log.error('failed to send activation email, reason: %s', err.message);
      callback(err);
    } else {
      callback(null);
    }
  });

  */

  callback(null);
};

/**
 * Confirms a user account
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
UsersRouter.prototype.confirmActivateUser = function (req, res) {
  log.debug('activating user with token %s', req.params.token);

  if (req.query.redirect && validateRedirectUrl(req.query.redirect)) {
    return res.redirect(req.query.redirect);
  } else {
    return res.send({ status: 'activated' });
  }
};

/**
 * Reactivates a user account
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
UsersRouter.prototype.reactivateUser = async function (req, res, next) {
  const self = this;
  const User = this.storage.models.User;

  log.debug('sending account reactivation email to %s', req.body.email);

  try {
    const user = await User.findOne(
      {
        email: req.body.email,
      });

    if (!user) {
      return next(new errors.NotFoundError('User not found'));
    }

    if (user.activated) {
      return next(new errors.BadRequestError('User is already activated'));
    }

    if (!user.activator) {
      user.activator = crypto.randomBytes(256).toString('hex');
      await user.save();

      self._dispatchActivationEmail(user, req.body.redirect);

      res.status(201).send(user.toObject());
    } else {
      self._dispatchActivationEmail(user, req.body.redirect);
      res.status(201).send(user.toObject());
    }
  } catch (err) {
    return next(new errors.InternalError(err.message));
  }
};

/**
 * Deactivates a user account
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
// eslint-disable-next-line complexity
UsersRouter.prototype.destroyUser = async function (req, res, next) {
  const self = this;
  const { User } = this.storage.models;
  const deactivator = req.query.deactivator;
  const redirect = req.query.redirect;

  if (req.user.configuration && req.user.configuration.disableDeactivation) {
    return next(
      new errors.ConflictError('This account has the deactivation disabled')
    );
  }

  if (!deactivator || !redirect) {
    return next(new errors.BadRequestError('Missing required params'));
  }

  try {
    const user = await User.findOne({ email: req.params.id });

    if (!user) {
      return next(new errors.NotFoundError('User not found'));
    }

    if (req.user._id !== user._id) {
      return next(new errors.NotAuthorizedError());
    }

    user.deactivator = deactivator;

    sendGridMail.setApiKey(self.config.mailer.sendgrid.api_key);

    const emailData = {
      to: user.email,
      from: {
        email: self.config.mailer.from || 'activate@internxt.com',
        name: 'Internxt',
      },
      subject: '',
      text: 'deactivate acount',
      html: 'deactivate acount',
      personalizations: [
        {
          to: [
            {
              email: user.email,
            },
          ],
          dynamic_template_data: {
            email: user.email,
            deletetion_url: redirect,
          },
        },
      ],
      template_id: self.config.mailer.sendgrid.delete_template_id,
      mail_settings: {
        sandbox_mode: {
          enable: self.config.mailer.sendgrid.sandbox_mode || false,
        },
      },
    };

    await sendGridMail.send(emailData, false).catch(err => {
      log.error('[USERS/DESTROY_USER]: failed to send deactivation email, reason: %s', err.message);

      return next(new errors.InternalError(err.message));
    });

    await user.save();

    res.status(200).send(user.toObject());
  } catch (err) {
    log.error(
      '[USERS/DESTROY_USER]: Error while starting user deactivation: %s, user: %s %s',
      err.message,
      req.user?.id,
      req.user?.email
    );

    return next(new errors.InternalError(err.message));
  }
};

/**
 * Confirms the deletion of a user account
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
UsersRouter.prototype.confirmDestroyUser = async function (req, res, next) {
  const User = this.storage.models.User;
  const Bucket = this.storage.models.Bucket;

  log.info('[USERS/CONFIRM_DESTROY]: deactivating user account with token %s', req.params.token);

  try {
    const user = await User.findOne({ deactivator: req.params.token });

    if (!user) {
      return next(new errors.NotFoundError('User not found'));
    }

    await Bucket.deleteMany(
      {
        userId: user.uuid,
      });
    await user.deleteOne();

    if (req.query.redirect) {
      res.redirect(req.query.redirect);
    } else {
      console.log('User removed: ', user.email);
      res.status(200).send(user.toObject());
    }
  } catch (err) {
    log.error(
      '[USERS/CONFIRM_DESTROY]: Error while deactivating user: %s',
      err.message
    );

    return next(new errors.InternalError(err.message));

  }
};

UsersRouter.prototype.confirmDestroyUserStripe = async function (req, res, next) {
  const self = this;
  const stripeUtils = require('../stripeService');
  let user = null;
  try {
    user = await this.storage.models.User.findOne(
      { deactivator: req.params.token });

    if (!user) {
      return next(
        new errors.InternalError('Error ocurred while requesting user')
      );
    }

    log.error(
      '[USERS/STRIPE_CONFIRM_DESTROY]: User requested deactivation: %s',
      user.email
    );

    const stripeUser = await stripeUtils
      .customerExists(user._id)
      .catch((err) => {
        log.error(
          '[USERS/STRIPE_CONFIRM_DESTROY]: Cannot determine customer exists on stripe: %s, user email: %s',
          err.message,
          user?.email
        );
        throw new errors.InternalError('Error ocurred while deactivating user account');
      });

    if (stripeUser) {
      let subscriptions = stripeUser.data[0].subscriptions.data;

      if (subscriptions.length > 0) {
        return stripeUtils
          .cancelSubscriptionById(subscriptions[0].id)
          .then(() => {
            self.confirmDestroyUser(req, res, next);
          })
          .catch(() => {
            res.status(400).send({ error: 'Cannot cancel current plan' });
          });
      }

      return self.confirmDestroyUser(req, res, next);
    }

    return self.confirmDestroyUser(req, res, next);
  } catch (err) {
    log.error(
      '[USERS/STRIPE_CONFIRM_DESTROY]: Error while deactivating user: %s, user email: %s',
      err.message,
      user?.email
    );

    return next(
      new errors.InternalError('Error ocurred while deactivating user account')
    );
  }
};

/**
 * Export definitions
 * @private
 */
UsersRouter.prototype._definitions = function () {
  return [
    [
      'POST',
      '/activations',
      this.getLimiter(limiter(5)),
      rawbody,
      this.reactivateUser,
    ],
    [
      'GET',
      '/activations/:token',
      this.getLimiter(limiter(5)),
      this.confirmActivateUser,
    ],
    [
      'DELETE',
      '/users/:id',
      this.getLimiter(limiter(5)),
      this._verify,
      this.destroyUser,
    ],
    [
      'GET',
      '/deactivations/:token',
      this.getLimiter(limiter(5)),
      this.confirmDestroyUser,
    ],
    [
      'GET',
      '/deactivationStripe/:token',
      this.getLimiter(limiter(5)),
      this.confirmDestroyUserStripe,
    ],
  ];
};

module.exports = UsersRouter;
