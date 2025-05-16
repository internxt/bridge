'use strict';

const Router = require('./index');
const dns = require('dns');
const isIp = require('is-ip');
const errors = require('storj-service-error-types');
const inherits = require('util').inherits;
const middleware = require('storj-service-middleware');
const log = require('../../logger');
const limiter = require('../limiter').DEFAULTS;
const rawBody = require('../middleware/raw-body');
const { getPOWMiddleware, getChallenge } = require('../middleware/pow');
const { authFarmer } = require('../middleware/farmer-auth');

/**
 * Handles endpoints for all contact related endpoints
 * @constructor
 * @extends {Router}
 */
function ContactsRouter(options) {
  if (!(this instanceof ContactsRouter)) {
    return new ContactsRouter(options);
  }

  Router.apply(this, arguments);

  this.redis = options.redis;
  this.checkPOW = getPOWMiddleware(options.redis);
  this.getLimiter = middleware.rateLimiter(options.redis);
  this.options = options;
}

inherits(ContactsRouter, Router);

ContactsRouter.DEFAULTS = {
  skip: 0,
  limit: 30
};

/**
 * Returns the correct skip and limit from the supplied page number
 * @private
 */
ContactsRouter.prototype._getSkipLimitFromPage = function (page) {
  page = page || 1;

  return {
    limit: ContactsRouter.DEFAULTS.limit,
    skip: (page - 1) * ContactsRouter.DEFAULTS.limit
  };
};

ContactsRouter.prototype.createChallenge = function (req, res, next) {
  let powOpts = this.config.application.powOpts;
  getChallenge(this.redis, powOpts, function (err, data) {
    if (err) {
      return next(new errors.InternalError(err.message));
    }
    res.status(201).send(data);
  });
};

ContactsRouter.prototype.getShards = function (req, res, next) {
  const shards = req.body.shards;
  this.storage.models.Shard.find({ hash: { $in: shards } }).select('hash').exec(function (err, dataHash) {
    if (err) {
      return next(new errors.InternalError(err.message));
    }
    res.status(200).send(dataHash.map(x => x.hash));
  });
};

ContactsRouter.prototype.createContact = async function (req, res, next) {
  // We do not allow this DDNS provider since connection attempt to that host makes antiviruses stop nodes.
  if (req.body.address === '101.camdvr.org') {
    return next(new errors.InternalError('DDNS provider is not allowed'));
  }

  const { Contact } = this.storage.models;

  const alreadyExists = await Contact.findOne({ address: req.body.address, port: parseInt(req.body.port, 10) });

  if (alreadyExists) {
    // return res.status(400).send({ message: 'Farmer with same address/port already exists' });
  }

  Contact.record({
    nodeID: req.headers['x-node-id'],
    address: req.body.address,
    port: req.body.port,
    lastSeen: Date.now(),
    spaceAvailable: req.body.spaceAvailable,
    responseTime: 10000, // Need to set a default responseTime for new contacts
    reputation: 0, // Set default reputation for new contacts as well
    protocol: req.body.protocol,
    ip: req.headers['x-forwarded-for']
  }, function (err, contact) {
    if (err) {
      return next(new errors.InternalError(err.message));
    }

    // TODO Send 201 status when created, and 200 when it already
    // exists. Multiple calls to record should behave the same,
    // as is current.
    res.status(200).send({
      nodeID: contact.nodeID,
      address: contact.address,
      port: contact.port
    });
  });
};

ContactsRouter.prototype._getContactIP = function (addr) {
  if (isIp(addr)) {
    return addr;
  } else {
    dns.resolve4(addr, function (err, addresses) {
      if (err) {
        log.warn('getIPLookup: Could not resolve address: %s', addr);

        return null;
      }
      log.debug('getIPLookup: Resolved address: %s to %s', addr, addresses[0]);

      return addresses[0];
    });
  }
};

ContactsRouter.prototype.setDefaultResponseTime = function (nodeID) {
  this.storage.models.Contact.findOneAndUpdate({
    _id: nodeID,
    responseTime: { $exists: false }
  }, {
    $set: {
      responseTime: 10000
    }
  }, {
    upsert: false
  }, (err) => {
    if (err) {
      log.error('Error setting default responseTime for %s, reason: %s',
        nodeID, err.message);
    }
  });
};

ContactsRouter.prototype.setDefaultReputation = function (nodeID) {
  this.storage.models.Contact.findOneAndUpdate({
    _id: nodeID,
    reputation: { $exists: false }
  }, {
    $set: {
      reputation: 0
    }
  }, {
    upsert: false
  }, (err) => {
    if (err) {
      log.error('Error setting default reputation for %s, reason: %s',
        nodeID, err.message);
    }
  });
};

ContactsRouter.prototype.patchContactByNodeID = async function (req, res, next) {
  const { Contact } = this.storage.models;
  const nodeID = req.headers['x-node-id'];

  const nodeInfo = await Contact.findOne({ _id: nodeID });

  if (nodeInfo && nodeInfo.timeoutRate > this.options.config.application.timeoutRateThreshold) {
    return res.status(404).send({ error: 'Your node was offline more than 1 hour' });
  }

  const alreadyExists = await Contact.findOne({ address: req.body.address, port: parseInt(req.body.port, 10), _id: { $ne: nodeID } });

  if (alreadyExists) {
    return res.status(404).send({ error: 'Node info already exists' });
  }

  const data = {
    lastSeen: Date.now()
  };

  if (req.body.address) {
    data.address = req.body.address;
  }

  data.ip = req.headers['x-forwarded-for'];

  if (req.body.port) {
    data.port = req.body.port;
  }

  if (req.body.protocol) {
    data.protocol = req.body.protocol;
  }

  if (req.body.spaceAvailable === false ||
    req.body.spaceAvailable === true) {
    data.spaceAvailable = req.body.spaceAvailable;
  }

  Contact.findOneAndUpdate({ _id: nodeID }, { $set: data }, {
    upsert: false,
    returnNewDocument: true
  }, (err, contact) => {
    if (err) {
      return next(new errors.InternalError(err.message));
    }
    if (!contact) {
      return next(new errors.NotFoundError('Contact not found'));
    }
    if (!contact.responseTime) {
      this.setDefaultResponseTime(nodeID);
    }
    if (!contact.reputation) {
      this.setDefaultReputation(nodeID);
    }

    res.status(201).send({
      nodeID: contact.nodeID,
      address: contact.address,
      port: contact.port,
      spaceAvailable: contact.spaceAvailable
    });
  });
};

/**
 * Returns the contact information for the given nodeID
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Function} next
 */
ContactsRouter.prototype.getContactByNodeID = function (req, res, next) {
  const Contact = this.storage.models.Contact;

  Contact.findOne({ _id: req.params.nodeID }, (err, contact) => {
    if (err) {
      return next(new errors.InternalError(err.message));
    }

    if (!contact) {
      return next(new errors.NotFoundError('Contact not found'));
    }

    if (contact.timeoutRate > this.options.config.application.timeoutRateThreshold) {
      return res.status(404).send(contact.toObject());
    }

    res.status(200).send(contact.toObject());
  });
};

/**
 * Export definitions
 * @private
 */
ContactsRouter.prototype._definitions = function () {
  return [
    ['GET', '/contacts/:nodeID', this.getLimiter(limiter(200)), this.getContactByNodeID],
    ['PATCH', '/contacts/:nodeID', this.getLimiter(limiter(200)), rawBody, authFarmer, this.patchContactByNodeID],
    ['POST', '/contacts', this.getLimiter(limiter(200)), this.checkPOW, rawBody, authFarmer, this.createContact],
    ['POST', '/contacts/challenges', this.getLimiter(limiter(200)), rawBody, authFarmer, this.createChallenge],
    ['POST', '/contacts/shards', this.getLimiter(limiter(200)), rawBody, authFarmer, this.getShards]
  ];
};

module.exports = ContactsRouter;
