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

function GetErrorMessage(error) {
  let errMsg;
  const isServerError = !!error.response;
  const serverUnavailable = !!error.request;

  if (isServerError) {
    errMsg = error.response.data.error;
  } else if (serverUnavailable) {
    errMsg = 'server not available';
  } else {
    errMsg = error.message;
  }

  return errMsg;
}

StripeRouter.prototype._getStripe = function (isTest = false) {
  return new Stripe(isTest ? this.config.stripe.SK_TEST : this.config.stripe.SK_LIVE, { apiVersion: '2020-08-27' });
};

StripeRouter.prototype._getMetadata = async function (checkoutSessionId, isTest) {
  const stripe = this._getStripe(isTest);
  const lineItems = await stripe.checkout.sessions.listLineItems(checkoutSessionId);
  const { metadata } = lineItems.data[0].price;

  return metadata;
};

StripeRouter.prototype._webhookInvoicePaymentSucceded = function (data, res) {

  return res.status(200).send();

};

StripeRouter.prototype._webhookCheckoutSessionCompleted = async function (data, res) {
  const email = data.data.object.customer_details.email;
  const paymentStatus = data.data.object.payment_status;
  if (paymentStatus !== 'paid') {
    log.info(`[PAYMENTS] Checkout processed without action, ${email} has not paid successfully`);

    return res.status(200).send({ info: `Checkout processed without action, ${email} has not paid successfully` });
  }

  const checkoutSessionId = data.data.object.id; // stripe session id


  const metadata = await this._getMetadata(checkoutSessionId, !data.livemode);
  const { maxSpaceBytes } = metadata;

  try {
    await this._createOrUpdateUser({ email, maxSpaceBytes });
  } catch (err) {
    if (err.status === 304) {
      log.error(`[PAYMENTS] Error updating user: ${email} Storage bought: ${maxSpaceBytes}. Message: ${GetErrorMessage(err)}`);

      return res.status(304).send(err);
    }
    log.error(`[PAYMENTS] Error creating user: ${email} Storage bought: ${maxSpaceBytes}. Message: ${GetErrorMessage(err)}`);

    return res.status(500).send({ info: `Error creating user: ${email}. Storage bought: ${maxSpaceBytes}`, msg: GetErrorMessage(err) });
  }

  // To keep records of plans bought
  try {
    const plan = {
      name: metadata.name,
      limit: 0,
      type: metadata.planType,
      isTest: !data.livemode
    };
    await this._createOrUpdateDrivePlan({ email, plan });
  } catch (err) {
    log.error(`[PAYMENTS] Error creating drive plan for user ${email}: ${GetErrorMessage(err)}`);
  }


  return res.status(200).send();
};

StripeRouter.prototype._webhookCustomerSubscriptionDeleted = function (data, res) {
  const stripe = this._getStripe(!data.livemode);
  const object = data.data.object;
  const customer = object.customer;

  stripe.customers.retrieve(customer, (err, customer_obj) => {
    if (err) {
      log.error('[PAYMENTS] Webhook error, customer not found on stripe', err);

      return res.status(200).send({ error: 'Unkown customer on stripe' });
    }

    const email = customer_obj.email;
    this._updateAccountStorage(email, 0).catch((err) => {
      log.error(`[PAYMENTS] Webhook error, cancel subscription for user ${email}, ${GetErrorMessage(err)}`);

      return res.status(500).send({ error: 'Error updating user on bridge database' });
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
    log.error('[TEAMS] Webhook error, reason: %s', GetErrorMessage(err));
    res.status(500).send({ error: GetErrorMessage(err) });
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

  return res.status(200).send({ info: 'No action' });

};

StripeRouter.prototype._webhookPaymentIntentFailed = function (data, res) {
  return res.status(200).send({ info: 'No action' });
};

StripeRouter.prototype._webhookPaymentIntentCanceled = function (data, res) {
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
    log.info(`[PAYMENTS] Signed webhook from stripe received: ${webhookObject.type}`);
  } catch (err) {
    log.warn('[PAYMENTS] Webhook. Invalid Webhook signature');

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