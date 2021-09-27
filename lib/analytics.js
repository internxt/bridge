'use strict';
const Analytics = require('analytics-node');
const Config = require('./config.js');
const uuidv4 = require('uuid/v4');

async function stripePayment(event) {
  const stripeKey = process.env.NODE_ENV !== 'production' ? Config.api.SK_TEST : Config.api.SK_LIVE;
  const stripe = require('stripe')(stripeKey, { apiVersion: '2020-08-27' });
  const data = event.data.object;
  const sid = data.id; // stripe session id
  const revenue = data.amount_total;
  const currency = data.currency;
  const type = data.mode;
  const price = data.amount_subtotal;
  if (data.payment_status === 'paid') {
    const email = data.customer_details.email;
    const paymentType = data.mode;
    const lineItems = await stripe.checkout.sessions.listLineItems(
      sid, { limit: 1 }
    );
    // Retrieve price
    const item = lineItems.data[0].price;
    // Ensure it has all the metadata
    const priceId = item.id;
    const payment_frequency = paymentType === 'subscription' ? item.recurring.interval : 'lifetime';

    return {
      revenue: revenue / 100,
      price: price / 100,
      currency: currency,
      payment_id: priceId,
      quantity: 1,
      type: type,
      product_name: item.metadata.tracking_name,
      email: email,
      payment_type: paymentType,
      payment_bridge: 'stripe',
      payment_frequency: payment_frequency,
      marketing_name: item.metadata.marketing_name
    };

  } else {
    return 'not paid';
  }
}

async function trackPayment(event, source = 'stripe') {
  const segmentKey = process.env.NODE_ENV !== 'production' ? Config.api_keys.segment_test : Config.api_keys.segment;
  const analytics = new Analytics(segmentKey, { flushAt: 1 });
  const track = {
    anonymousId: uuidv4(),
    event: 'Payment Completed',
  };
  if (source === 'stripe') {
    track.porperties = await stripePayment(event);
    if (track.properties !== 'not paid') {
      analytics.track(track);
    }
  }
}

async function stripeSubscriptionDeleted(event, email) {
  const data = event.data.object;
  const item = data.items.data[0];
  const plan = item.plan;

  return {
    email: email,
    amount: plan.amount,
    payment_frequency: plan.interval,
    currency: plan.currency,
    payment_id: plan.id,
    payment_bridge: 'stripe',
    quantity: 1
  };

}

async function trackSubscriptionDeleted(event, userId, email, source =' stripe') {
  const segmentKey = process.env.NODE_ENV !== 'production' ? Config.api_keys.segment_test : Config.api_keys.segment;
  const analytics = new Analytics(segmentKey, { flushAt: 1 });

  const track = {
    userId,
    event: 'Subscription Canceled',
  };

  if (source === 'stripe') {
    track.properties = await stripeSubscriptionDeleted(event, email);
  }
  analytics.track(track);
  analytics.identify({
    userId: userId,
    traits: {
      member_tier: 'free',
      email: email,
      coupon: null,
      plan: null,
      payment_frequency: null,
    }
  });
}


module.exports = {
  trackPayment,
  trackSubscriptionDeleted
};