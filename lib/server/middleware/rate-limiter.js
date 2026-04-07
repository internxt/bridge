'use strict';


/**
 * module - ratelimiter
 *
 * forked from https://github.com/juliendangers/express-limiter2 and updated
 * to work with Internxt framework
 *
 * @param  {type} db  redis data client
 * @param  {type} app express app or express 4.0 router
 * @return {type}     returns a function that takes config options object
 */
module.exports = function (db, app) {

  return function (opts) {
    const middleware = function (req, res, next) {
      if (!db || !db.connected) {
        return next();
      }
      if (opts.whitelist && opts.whitelist(req)) {
        return next();
      }
      opts.onRateLimited = typeof opts.onRateLimited === 'function'
        ? opts.onRateLimited
        : function (req, res, _next) {
          res.status(429).send('Too Many Requests');
        };
      // default rate-limit by IP address & method & path
      opts.lookup = typeof opts.lookup === 'function'
        ? opts.lookup
        : function (req) {
          return [req.path, req.method, req.connection.remoteAddress];
        };
      opts.keyFormatter = typeof opts.keyFormatter === 'function'
        ? opts.keyFormatter
        : function (parts) {
          return 'rateLimit:' + parts.join(':');
        };
      const key = opts.keyFormatter(opts.lookup(req));
      db.get(key, function (err, limit) {
        if (err && opts.ignoreErrors) {
          return next();
        }
        const now = Date.now();
        limit = limit
          ? JSON.parse(limit)
          : {
            total: opts.total,
            remaining: opts.total,
            reset: now + opts.expire
          };

        if (now > limit.reset) {
          limit.reset = now + opts.expire;
          limit.remaining = opts.total;
        }

        // do not allow negative remaining
        limit.remaining = Math.max(Number(limit.remaining) - 1, -1);
        db.set(key, JSON.stringify(limit), 'PX', opts.expire, function () {
          if (!opts.skipHeaders) {
            res.set('X-RateLimit-Limit', limit.total);
            res.set('X-RateLimit-Remaining', Math.max(limit.remaining, 0));
            res.set('X-RateLimit-Reset', Math.ceil(limit.reset / 1000)); // UTC epoch seconds
          }

          if (limit.remaining >= 0) {
            return next();
          }

          const after = (limit.reset - Date.now()) / 1000;

          if (!opts.skipHeaders) {
            res.set('Retry-After', after);
          }

          opts.onRateLimited(req, res, next);
        });

      });
    };
    if (app && opts.method && opts.path) {
      app[opts.method](opts.path, middleware);
    }

    return middleware;
  };
};
