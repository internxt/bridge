'use strict';

const Router = require('./index');
const middleware = require('storj-service-middleware');
const rawbody = middleware.rawbody;
const log = require('../../logger');
const errors = require('storj-service-error-types');
const merge = require('merge');
const inherits = require('util').inherits;
const authenticate = middleware.authenticate;
const crypto = require('crypto');
const storj = require('storj-lib');
const limiter = require('../limiter').DEFAULTS;
const disposable = require('disposable-email');
const { trackUserActivated } = require('../../analytics');
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

  this._verify = authenticate(this.storage);
  this.getLimiter = middleware.rateLimiter(options.redis);
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
  let callback = cb || storj.utils.noop;
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
 * Sends a delayed activation email with optional `url` for beta signup
 * @private
 */
UsersRouter.prototype._dispatchDelayedActivationEmail = function (user, cb) {
  let self = this;
  self.mailer.dispatchSendGrid(
    user.email,
    'delayed-activation',
    {},
    function (err) {
      if (err) {
        log.error(
          'failed to send signup throttling email, reason: %s',
          err.message
        );
        cb(err);
      } else {
        cb(null);
      }
    }
  );
};

/**
 * Sends an activation email based on configuration options
 * @private
 */
UsersRouter.prototype._dispatchActivationEmailSwitch = function (user, cb) {
  if (this.config.application.delayedActivation) {
    this._dispatchDelayedActivationEmail(user, cb);
  } else {
    this._dispatchActivationEmail(user, cb);
  }
};

/**
 * Registers a new user
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
UsersRouter.prototype.createUser = function (req, res, next) {
  const self = this;
  const User = this.storage.models.User;

  if (!req.body.email) {
    return next(new errors.BadRequestError('Not valid email address'));
  }

  if (!req.body.password) {
    return next(new errors.BadRequestError('Not valid password'));
  }

  // Ensure email address is lowercase & trimmed to avoid future search errors
  req.body.email = req.body.email.toLowerCase().trim();

  // Check if email address if valid.
  // RFC 5322 Official Standard
  // eslint-disable-next-line no-control-regex
  const emailPattern =
    /^((?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|'(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*'))@((?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\]))$/;
  const match = req.body.email.match(emailPattern);

  if (!match) {
    return next(new errors.BadRequestError('Not valid email address'));
  }

  // Check if disposable email
  const emailDomain = match[2];
  const allowedEmail = disposable.validate(emailDomain);

  if (!allowedEmail) {
    log.error('User %s is a fake email', req.body.email);

    return next(new errors.BadRequestError('Not valid email address provider'));
  }

  // Register
  log.debug('registering user account for %s', req.body.email);

  if (req.body.referralPartner) {
    self._createUserWithOpts(req, res, next);
  } else {
    User.create(req.body.email, req.body.password, function (err, user) {
      if (err) {
        return next(err);
      }

      user.maxSpaceBytes = 1024 * 1024 * 1024 * 2;
      user.activated = true;

      trackUserActivated(user.uuid, req.body.email);

      user.save();

      /*
      analytics.identify(req.headers.dnt, {
        userId: user.uuid,
        traits: {
          activated: false
        }
      });

      analytics.track(req.headers.dnt, {
        userId: user.uuid,
        event: 'User Created'
      });
      */

      self._dispatchAndCreatePubKey(user, req, res, next);
    });
  }
};

/**
 * Dispatch activation email and create pubkey if none
 * @param {Object} user
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
UsersRouter.prototype._dispatchAndCreatePubKey = function (
  user,
  req,
  res,
  next
) {
  const self = this;
  const PublicKey = this.storage.models.PublicKey;

  if (!req.body.pubkey) {
    self._dispatchActivationEmailSwitch(user, function (err) {
      if (err) {
        log.error('failed to send deactivation email, reason: %s', err.message);
      }
    });

    return res.status(201).send(user.toObject());
  }

  PublicKey.create(user, req.body.pubkey, function (err, pubkey) {
    if (err) {
      user.remove();

      return next(new errors.BadRequestError(err.message));
    }

    // NB: Don't send activation email, send beta list email
    // NB: Send email explaining why they cant activate yet
    self._dispatchActivationEmailSwitch(user, function (err) {
      if (err) {
        log.error('failed to send deactivation email, reason: %s', err.message);
      }
    });

    res.status(201).send(
      merge(user.toObject(), {
        pubkey: pubkey.key,
      })
    );
  });
};

/**
 * Creates user with opts object, does extra logic involved
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
UsersRouter.prototype._createUserWithOpts = function (req, res, next) {
  const self = this;
  const User = this.storage.models.User;
  const Partner = this.storage.models.Partner;
  const opts = {
    email: req.body.email,
    password: req.body.password,
  };

  Partner.findOne({ name: req.body.referralPartner }, function (err, partner) {
    if (err) {
      return next(err);
    }

    opts.referralPartner = partner ? partner.id : null;

    User.create(opts, function (err, user) {
      if (err) {
        return next(err);
      }

      self._dispatchAndCreatePubKey(user, req, res, next);
    });
  });
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
UsersRouter.prototype.reactivateUser = function (req, res, next) {
  const self = this;
  const User = this.storage.models.User;

  log.debug('sending account reactivation email to %s', req.body.email);

  User.findOne(
    {
      email: req.body.email,
    },
    function (err, user) {
      if (err) {
        return next(new errors.InternalError(err.message));
      }

      if (!user) {
        return next(new errors.NotFoundError('User not found'));
      }

      if (user.activated) {
        return next(new errors.BadRequestError('User is already activated'));
      }

      if (!user.activator) {
        user.activator = crypto.randomBytes(256).toString('hex');
        user.save(function (err) {
          if (err) {
            return next(new errors.InternalError(err.message));
          }
          self._dispatchActivationEmail(user, req.body.redirect);
          res.status(201).send(user.toObject());
        });
      } else {
        self._dispatchActivationEmail(user, req.body.redirect);
        res.status(201).send(user.toObject());
      }
    }
  );
};

/**
 * Deactivates a user account
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
UsersRouter.prototype.destroyUser = function (req, res, next) {
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

  User.findOne({ _id: req.params.id }, function (err, user) {
    if (err) {
      return next(new errors.InternalError(err.message));
    }

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

    sendGridMail.send(emailData, false, function (err) {
      if (err) {
        log.error('failed to send deactivation email, reason: %s', err.message);

        return next(new errors.InternalError(err.message));
      }

      user.save(function (err) {
        if (err) {
          return next(new errors.InternalError(err.message));
        }

        res.status(200).send(user.toObject());
      });
    });
  });
};

/**
 * Confirms the deletion of a user account
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
UsersRouter.prototype.confirmDestroyUser = function (req, res, next) {
  const User = this.storage.models.User;
  const Bucket = this.storage.models.Bucket;

  log.debug('deactivating user account with token %s', req.params.token);

  User.findOne({ deactivator: req.params.token }, function (err, user) {
    if (err) {
      return next(new errors.InternalError(err.message));
    }

    if (!user) {
      return next(new errors.NotFoundError('User not found'));
    }

    Bucket.remove(
      {
        userId: user.uuid,
      },
      (err) => {
        if (err) {
          return next(new errors.InternalError(err.message));
        } else {
          user.remove((err) => {
            if (err) {
              return next(new errors.InternalError(err.message));
            }
            if (req.query.redirect) {
              res.redirect(req.query.redirect);
            } else {
              console.log('User removed: ', user.email);
              res.status(200).send(user.toObject());
            }
          });
        }
      }
    );
  });
};

UsersRouter.prototype.confirmDestroyUserStripe = function (req, res, next) {
  const self = this;
  const stripeUtils = require('../stripeService');

  this.storage.models.User.findOne(
    { deactivator: req.params.token },
    function (err, user) {
      if (err || !user) {
        return next(
          new errors.InternalError('Error ocurred while requesting user')
        );
      }

      stripeUtils
        .customerExists(user._id)
        .then((stripeUser) => {
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

          self.confirmDestroyUser(req, res, next);
        })
        .catch((err) => {
          log.error(
            'Cannot determine customer exists on stripe: %s',
            err.message
          );

          return res.status(500).send({ error: err.message });
        });
    }
  );
};

/**
 * Export definitions
 * @private
 */
UsersRouter.prototype._definitions = function () {
  return [
    ['POST', '/users', this.getLimiter(limiter(5)), rawbody, this.createUser],
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
      '/users/isactivated',
      this.getLimiter(limiter(5000)),
      rawbody,
      this.isActivated,
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
