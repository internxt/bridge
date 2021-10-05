'use strict';

const Analytics = require('analytics-node');
const Config = require('./config');
const { v4: uuidv4 } = require('uuid');
const program = require('commander');

/* SETUP */
const config = new Config(process.env.NODE_ENV || 'develop', program.Config, program.datadir);


async function stripePayment(event) {
  const stripeKey = event.livemode ? config.stripe.SK_LIVE : config.stripe.SK_TEST;
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

    let couponProperties = null;
    // Only track coupons for subscribers
    if (paymentType === 'subscription') {
      couponProperties = await stripeCoupon(event);
      couponProperties.email = email;
    }

    const paymentProperties = {
      revenue: revenue / 100,
      price: price / 100,
      currency: currency,
      payment_id: priceId,
      quantity: 1,
      type: type,
      product_id: item.product,
      email: email,
      payment_type: paymentType,
      payment_bridge: 'stripe',
      payment_frequency: payment_frequency,
    };

    return { paymentProperties, couponProperties };

  } else {
    return 'not paid';
  }
}

async function stripeCoupon(event) {

  const stripeKey = event.livemode ? config.stripe.SK_LIVE : config.stripe.SK_TEST;
  const stripe = require('stripe')(stripeKey, { apiVersion: '2020-08-27' });


  const subscriptionId = event.data.object.subscription;
  let couponProperties = null;
  const { discount } = await stripe.subscriptions.retrieve(subscriptionId);
  if (discount) {
    couponProperties = {
      id: discount.id,
      name: discount.coupon.name,
      percent_off: discount.coupon.percent_off
    };
  }

  return couponProperties;

}

async function trackPayment(event, source = 'stripe') {
  const segmentKey = event.livemode ? config.api_keys.segment : config.api_keys.segment_test;
  const analytics = new Analytics(segmentKey, { flushAt: 1 });
  // AnonymousId shoulb be the same for both tracks
  const anonymousId = uuidv4();
  const trackPayment = {
    anonymousId,
    event: 'Payment Completed',
  };
  const trackCoupon = {
    anonymousId,
    event: 'Coupon Redeemed'
  };
  if (source === 'stripe') {
    const { paymentProperties, couponProperties } = await stripePayment(event);
    // Ensure that the payment has been made
    if (paymentProperties !== 'not paid') {
      trackPayment.properties = paymentProperties;
      analytics.track(trackPayment);
      // Track Only if there is a coupon attached to the payment
      if (couponProperties) {
        trackCoupon.properties = couponProperties;
        analytics.track(trackCoupon);
      }
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

async function trackSubscriptionDeleted(event, userId, email, source = 'stripe') {
  const segmentKey = event.livemode ? config.api_keys.segment : config.api_keys.segment_test;
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

function trackUserActivated(userId, email) {
  const segmentKey = process.env.NODE_ENV === 'development' ? config.api_keys.segment_test : config.api_keys.segment;
  const analytics = new Analytics(segmentKey, { flushAt: 1 });

  analytics.identify({
    userId,
    traits: {
      email
    }
  });

  analytics.track({
    userId,
    event: 'User Activated',
    properties: {
      email
    }
  });
}


module.exports = {
  trackPayment,
  trackSubscriptionDeleted,
  trackUserActivated
};