'use strict';

module.exports = function RouteFactory(options) {
  return ([
    require('./routes/buckets'),
    require('./routes/users'),
    require('./routes/frames'),
    require('./routes/contacts'),
    require('./routes/stripe'),
    require('./routes/gateway')
  ]).map(function (Router) {
    return new Router({
      config: options.config,
      network: options.network,
      storage: options.storage,
      mailer: options.mailer,
      contracts: options.contracts,
      redis: options.redis,
      networkQueue: options.networkQueue,
    }).getEndpointDefinitions();
  }).reduce(function (set1, set2) {
    return set1.concat(set2);
  }, []);
};
