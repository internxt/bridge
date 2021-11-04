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


StripeRouter.prototype._getStripe = function (isTest = false) {
  return new Stripe(isTest ? this.config.stripe.SK_TEST : this.config.stripe.SK_LIVE, { apiVersion: '2020-08-27' });
};

StripeRouter.prototype._webhookInvoicePaymentSucceded = function (data, res) {

  return res.status(501).send();

};

StripeRouter.prototype._webhookCheckoutSessionCompleted = async function (data, res) {
  // trackPayment(data).catch(err => log.error(`Analytics Error: ${err}`));
  return res.status(501).send();
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

      this._updateAccountStorage(email, 0).catch(() => {
        log.error('Webhook error, cannot update %s on bridge');

        return res.status(500).send({ error: 'Error updating user on bridge database' });
      });

      trackSubscriptionDeleted(data, user.uuid, email).catch(err => log.error(`Analytics Error: ${err}`));
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

StripeRouter.prototype._createAccount = function (email) {
  const { username, password } = this.config.gateway;
  const body = { email };

  return axios.post(`${this.config.drive.api}/api/gateway/register/stage`, body, {
    headers: { 'Content-Type': 'application/json' },
    auth: { username, password }
  });
};

StripeRouter.prototype._updateAccountStorage = async function (email, maxSpaceBytes) {
  const { username, password } = this.config.gateway;
  const body = {
    email,
    maxSpaceBytes
  };

  return axios.post(`${this.config.drive.api}/api/gateway/user/update/storage`, body, {
    headers: { 'Content-Type': 'application/json' },
    auth: { username, password }
  });
};

StripeRouter.prototype._webhookPaymentIntentSucceeded = async function (data, res) {

  const charge = data.data.object.charges.data[0];
  const metadata = charge.metadata;

  const email = charge.receipt_email.toLowerCase();
  const maxSpaceBytes = metadata.maxSpaceBytes;

  try {
    await this._createOrUpdateUser({ email, maxSpaceBytes });
  } catch (err) {
    if (err.status === 304) {
      log.error(`Error updating user: ${email} Storage bought: ${maxSpaceBytes}. Error: ${err.message}`);

      return res.status(304).send(err);
    }
    log.error(`Error creating user: ${email} Storage bought: ${maxSpaceBytes}. Error: ${err.message}`);

    return res.status(500).send({ info: `Error creating user: ${email}. Storage bought: ${maxSpaceBytes}`, msg: err.message });
  }

  // To keep records of plans bought
  try {
    const plan = {
      name: metadata.name,
      limit: metadata.maxSpaceBytes,
      type: metadata.planType,
      isTest: !data.livemode
    };
    await this._createOrUpdateDrivePlan({ email, plan });
  } catch (err) {
    log.error('Error creating drive plan for user %s: %s', email, err.message);
  }

  return res.status(200).send({ info: `Payment intent Successfully processed for ${email}. Metadata: ${JSON.stringify(metadata)}` });

};

StripeRouter.prototype._webhookPaymentIntentFailed = function (data, res) {
  return res.status(501).send();
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

StripeRouter.prototype._createOrUpdateUser = async function (body) {
  const { username, password } = this.config.gateway;

  return axios.post(`${this.config.drive.api}/api/gateway/user/updateOrCreate`, body, {
    headers: { 'Content-Type': 'application/json' },
    auth: { username, password }
  });
};

StripeRouter.prototype._createOrUpdateDrivePlan = async function (body) {
  const { username, password } = this.config.gateway;
  const User = this.storage.models.User;

  const user = await User.findOne({ _id: body.email });
  body.plan.userId = user.uuid;

  return axios.post(`${this.config.drive.api}/api/gateway/plan`, body, {
    headers: { 'Content-Type': 'application/json' },
    auth: { username, password }
  });
};

StripeRouter.prototype._definitions = function () {
  return [
    ['POST', '/stripe/webhook', this.getLimiter(limiter(5000)), rawbody, this.parseWebhook]
  ];
};

module.exports = StripeRouter;