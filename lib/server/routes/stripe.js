'use strict';

const Router = require('./index');
const inherits = require('util').inherits;
const middleware = require('storj-service-middleware');
const authenticate = middleware.authenticate;
const rawbody = middleware.rawbody;
const limiter = require('../limiter').DEFAULTS;
const errors = require('storj-service-error-types');
const log = require('../../logger');
const Stripe = require('stripe');
const axios = require('axios');
const bytes = require('bytes');
const { trackPayment, trackSubscriptionDeleted } = require('../../analytics');

/**
 * Handles endpoints for all stripe related webhooks
 * @constructor
 * @extends {Router}
 */
function StripeRouter(options) {
  if (!(this instanceof StripeRouter)) {
    return new StripeRouter(options);
  }

  Router.apply(this, arguments);

  this._verify = authenticate(this.storage);
  this.getLimiter = middleware.rateLimiter(options.redis);
}

inherits(StripeRouter, Router);

function getLifetimeTier(tier) {
  /**
   * BE CAREFUL CHANGING THIS UNTIL PAYMENTS ARE STANDARIZED
   */
  switch (tier) {
    case 'lifetime_1tb':
      return '1TB';
    case 'lifetime_2tb':
      return '2TB';
    case 'lifetime_5tb':
      return '5TB';
    case 'lifetime_10tb':
      return '10TB';
    case 'lifetime_20tb':
      return '20TB';
    default:
      return null;
  }
}

StripeRouter.prototype._getStripe = function (isTest = false) {
  return new Stripe(isTest ? this.config.stripe.SK_TEST : this.config.stripe.SK_LIVE, { apiVersion: '2020-08-27' });
};

StripeRouter.prototype._webhookInvoicePaymentSucceded = function (data, res) {

  return res.status(200).send('Endpoint is available.');

};

StripeRouter.prototype._webhookCheckoutSessionCompleted = async function (data, res) {
  trackPayment(data).catch(err => log.error(`Analytics Error: ${err}`));
  const User = this.storage.models.User;

  const stripe = this._getStripe(!data.livemode);
  const object = data.data.object;

  // Remove when controlling one-time payments
  if (!object.display_items) {
    return res.status(200).send({ info: `Lifetime Payment. Email: ${object.customer_details.email}` });
  }


  const customer = object.customer;
  const subscriptionItem = object.display_items[0];
  const productId = subscriptionItem.plan.product;

  let planInfo = {
    nickname: subscriptionItem.plan.nickname,
    amount: subscriptionItem.plan.amount,
    created: subscriptionItem.plan.created,
    interval: subscriptionItem.plan.interval,
    interval_count: subscriptionItem.plan.interval_count,
    trial_period_days: subscriptionItem.plan.trial_period_days,
    renewed_count: 0,
    renewed_failed_count: 0
  };


  stripe.customers.retrieve(customer, (err, customer_obj) => {
    if (err || !customer_obj || !customer_obj.email) {
      return res.status(500).send({ error: 'Either user or user email not found' });
    }
    const email = customer_obj.email; // check if customer_obj is null

    log.info('Webhook called by %s', email);

    stripe.products.retrieve(productId, (err, product) => {
      if (err) {
        log.error('Webhook error retrieving product');
        log.error('Stripe products retrieve error: ' + err);

        return res.status(500).send({ error: 'Error product metadata needed.' });
      }

      const metadata = product.metadata;

      User.findOne({ _id: email }, (err, user) => {
        if (err || !user) {
          log.error('Webhook error updating user');
          log.error('Stripe user findOne error: ' + err);

          return res.status(500).send({ error: 'Cannot find user e-mail' });
        }

        const planSize = parseInt(metadata.size_bytes);

        if (planSize === 1024 * 1024 * 1024 * 10 || planSize === 0) {
          planInfo.name = '10GB';
        } else if (planSize === 1024 * 1024 * 1024 * 3) {
          planInfo.name = '3GB';
        } else if (planSize === 1024 * 1024 * 1024 * 20) {
          planInfo.name = '20GB';
        } else if (planSize === 1024 * 1024 * 1024 * 200) {
          planInfo.name = '200GB';
        } else if (planSize === 1024 * 1024 * 1024 * 1024 * 2) {
          planInfo.name = '2TB';
        } else {
          planInfo.name = metadata.simple_name;
        }

        user.maxSpaceBytes = metadata.size_bytes;
        user.isFreeTier = false;

        user.subscriptionPlan = {
          isSubscribed: true,
          paymentBridge: 'stripe',
          plan: planInfo
        };

        user.save(err => {
          if (!err) {
            log.info('Webhook success for %s', email);

            return res.status(200).send();
          }
          log.error('Webhook failed updating model for %s', email);

          return res.status(500).send({ error: 'Error saving user metadata' });
        });
      });
    });
  });
};

StripeRouter.prototype._webhookCustomerSubscriptionDeleted = function (data, res) {
  const User = this.storage.models.User;
  const stripe = this._getStripe(!data.livemode);
  const object = data.data.object;
  const customer = object.customer;

  stripe.customers.retrieve(customer, (err, customer_obj) => {
    if (err) {
      log.error('Webhook error, customer not found on stripe', err);

      return res.status(200).send({ error: 'Unkown customer on stripe' });
    }

    const email = customer_obj.email;
    User.findOne({ _id: email }, (err, user) => {
      if (err || !user) {
        log.error('Webhook error, user %s not found on bridge database', email);

        return res.status(200).send({ error: 'Unkown customer on bridge' });
      }

      user.maxSpaceBytes = 0;
      user.isFreeTier = true;

      trackSubscriptionDeleted(data, user.uuid, email).catch(err => log.error(`Analytics Error: ${err}`));

      user.save(err => {
        if (err) {
          log.error('Webhook error, cannot update %s on bridge', email);

          return res.status(500).send({ error: 'Error updating user on bridge database' });
        }


        return res.status(200).send();
      });
    });
  });
};

StripeRouter.prototype._webhookTeamCheckoutSessionCompleted = async function (data, res) {
  const stripe = this._getStripe(!data.livemode);
  const User = this.storage.models.User;

  try {
    const object = data.data.object;
    const teamEmail = object.metadata.team_email;
    const customer = object.customer;
    const subscriptionItem = object.display_items[0];
    const productId = subscriptionItem.plan.product;
    const customer_obj = await stripe.customers.retrieve(customer);
    const email = customer_obj.email;
    const product = await stripe.products.retrieve(productId);
    const metadata = product.metadata;
    const account = await User.findOne({ _id: teamEmail });
    account.maxSpaceBytes = metadata.team_size_bytes;
    account.activated = true;
    account.activator = null;
    account.isFreeTier = false;
    account.save();
    log.info('[TEAMS] User %s paid for team account %s', email, teamEmail);
    res.status(200).end();
  } catch (err) {
    log.error('[TEAMS] Webhook error, reason: %s', err.message);
    res.status(500).send({ error: err.message });
  }
};

StripeRouter.prototype._createAccount = function (email, plan) {
  return axios.post(`${this.config.drive.api}/api/appsumo/register`, { email: email, plan: plan });
};

StripeRouter.prototype._updateToLifetimeAccount = async function (email, lifetime_tier) {
  const User = this.storage.models.User;
  const user = await User.findOne({ _id: email.toLowerCase() });
  if (user) {
    user.maxSpaceBytes = bytes.parse(lifetime_tier);
    await user.save();

    return Promise.resolve('User Upgraded Succesfuly.');
  } else {
    return Promise.reject('Could not update the user plan to lifetime.');
  }
};

StripeRouter.prototype._webhookPaymentIntentSucceeded = async function (data, res) {
  const User = this.storage.models.User;

  const charge = data.data.object.charges.data[0];
  const metadata = charge.metadata;

  const email = charge.receipt_email.toLowerCase();

  let user = await User.findOne({ _id: email });

  if (metadata.member_tier === 'lifetime') {
    const lifetime_tier = getLifetimeTier(metadata.lifetime_tier);

    if (!lifetime_tier) {
      log.error('Error creating lifetime: Invalid tier %s for user %s', metadata.member_tier, email);

      return res.status(400).send({ info: 'Invalid lifetime tier' });
    }

    const userNotExists = !user;

    if (userNotExists) {
      try {
        await this._createAccount(email, 'lifetime_' + lifetime_tier);
      } catch (e) {
        log.error('Error creating lifetime account. Email: ' + email);
        log.error(e);

        return res.status(500).send({ info: 'Error create Account', msg: e.message });
      }
    }

    try {
      await this._updateToLifetimeAccount(email, lifetime_tier);
    } catch (err) {
      log.error('Error when upgrading to Lifetime. ' + err);

      return res.status(500).send({ info: 'Error when upgrading', msg: err.message });
    }

    return res.status(200).send({ info: !user ? 'User created' : 'User updated' });
  }

  if (!user) {
    return res.status(500).send('User not found');
  }

  if (data.livemode && user.subscriptionPlan && user.subscriptionPlan.plan && user.subscriptionPlan.plan.renewed_count) {
    user.subscriptionPlan.plan.renewed_count++;
    user.save();
    res.status(200).send({ info: 'Updated user plan' });
  } else {
    res.status(200).send({ info: 'No data to update' });
  }
};

StripeRouter.prototype._webhookPaymentIntentFailed = function (data, res) {
  const stripe = this._getStripe(!data.livemode);
  const object = data.data.object;
  const customer = object.customer;
  stripe.customers.retrieve(customer, (err, customer_obj) => {
    if (err || !customer_obj || !customer_obj.email) {
      return res.status(500).send({ error: 'User not found' });
    }
    const User = this.storage.models.User;
    const email = customer_obj.email;
    User.findOne({ _id: email }, (err, user) => {
      if (user && user.subscriptionPlan && user.subscriptionPlan.plan) {
        if (user.subscriptionPlan.plan.renewed_failed_count) {
          user.subscriptionPlan.plan.renewed_failed_count++;
        } else {
          user.subscriptionPlan.plan.renewed_failed_count = 1;
        }
        user.save();
      }
    });
    res.status(200).send();
  });
};

StripeRouter.prototype._webhookPaymentIntentCanceled = function (data, res) {
  log.warn('[STRIPE] Payment Intent Canceled');
  res.status(200).send({ info: 'No action' });
};

StripeRouter.prototype.parseWebhook = function (req, res, next) {
  const isLiveMode = !!req.body.livemode;
  const stripe = this._getStripe(!isLiveMode);

  // Verify stripe signature
  const signature = req.headers['stripe-signature'];
  let webhookObject;
  try {
    webhookObject = stripe.webhooks.constructEvent(req.rawbody, signature, isLiveMode ? this.config.stripe.SIG : this.config.stripe.SIG_TEST);
    log.info('[%s] Signed webhook from stripe received: %s', isLiveMode ? 'LIVE' : 'TEST', webhookObject.type);
  } catch (err) {
    log.warn('[%s] Webhook vulnerability issue: Someone tried to mock on us', isLiveMode ? 'LIVE' : 'TEST');

    return res.status(500).send({ error: 'Security Error, invalid webhook source' });
  }

  switch (webhookObject.type) {
    case 'checkout.session.completed':
      // User completed the stripe checkout and trial period has started
      if (webhookObject.data.object.metadata.team_email) {
        return this._webhookTeamCheckoutSessionCompleted(webhookObject, res, next);
      }

      return this._webhookCheckoutSessionCompleted(webhookObject, res, next);
    case 'customer.subscription.deleted':
      // Subscription deleted, maybe from Stripe panel
      return this._webhookCustomerSubscriptionDeleted(webhookObject, res, next);
    case 'payment_intent.succeeded':
      // Trial period finished and successful payment, or recurring successful payment
      return this._webhookPaymentIntentSucceeded(webhookObject, res, next);
    case 'invoice.payment_succeeded':
      // An invoice is paid successfully
      return this._webhookInvoicePaymentSucceded(webhookObject, res, next);
    case 'payment_intent.canceled':
      return this._webhookPaymentIntentCanceled(webhookObject, res, next);
    default:
      console.warn('Unknown webhook: ', webhookObject.type);

      return next(errors.NotImplementedError(`Webhook ${webhookObject.type} not implemented yet`));
  }
};

StripeRouter.prototype._definitions = function () {
  return [
    ['POST', '/stripe/webhook', this.getLimiter(limiter(5000)), rawbody, this.parseWebhook]
  ];
};

module.exports = StripeRouter;