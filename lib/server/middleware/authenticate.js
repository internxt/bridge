/**
 * @module inxt-bridge/server/middleware/authenticate
 */

'use strict';

const secp256k1 = require('secp256k1');
const errors = require('../error-types');
const url = require('url');
const crypto = require('crypto');
const rawBodyMiddleware = require('./raw-body');
const basicauth = require('basic-auth');
const fromBody = ['POST', 'PATCH', 'PUT'];
const fromQuery = ['GET', 'DELETE', 'OPTIONS'];

function AuthenticateMiddlewareFactory({ User, PublicKey, UserNonce }) {
  const models = { User, PublicKey, UserNonce };

  function authenticate(req, res, next) {
    let strategy = AuthenticateMiddlewareFactory._detectStrategy(req);

    switch (strategy) {
      case 'BASIC':
        AuthenticateMiddlewareFactory._basic(models, req, res, next);
        break;
      case 'ECDSA':
        AuthenticateMiddlewareFactory._ecdsa(models, req, res, next);
        break;
      default:
        next(errors.NotAuthorizedError(
          'No authentication strategy detected'
        ));
    }
  }

  return [rawBodyMiddleware, authenticate];
}

AuthenticateMiddlewareFactory._basic = function ({ User }, req, res, next) {
  let creds = basicauth(req);
  User.lookup(creds.name, creds.pass, function (err, user) {
    if (err) {
      return next(err);
    }

    if (!user.activated) {
      return next(errors.ForbiddenError(
        'User account has not been activated'
      ));
    }

    req.user = user;

    next();
  });
};

AuthenticateMiddlewareFactory._ecdsa = async function ({ User, PublicKey, UserNonce }, req, res, next) {
  if (!AuthenticateMiddlewareFactory._verifySignature(req)) {
    return next(errors.NotAuthorizedError('Invalid signature'));
  }

  try {
    const pubkey = await PublicKey.findOne({
      _id: req.header('x-pubkey')
    });

    if (!pubkey) {
      return next(errors.NotAuthorizedError(
        'Public key not registered'
      ));
    }

    let params = AuthenticateMiddlewareFactory._getParams(req);

    const user = await User.findOne({ _id: pubkey.user });

    if (!user) {
      return next(errors.NotAuthorizedError('User not found'));
    }

    if (!user.activated) {
      return next(errors.ForbiddenError(
        'User account has not been activated'
      ));
    }

    var userNonce = new UserNonce({
      user: user.id,
      nonce: params.__nonce
    });

    try {
      await userNonce.save();
      req.user = user;
      req.pubkey = pubkey;

      return next();
    } catch (err) {
      if (err.code === 11000) {
        return next(errors.NotAuthorizedError(
          'Invalid nonce supplied'
        ));
      }

      return next(err);
    }
  } catch (err) {
    return next(err);
  }

};

/**
 * Returns a string representation of the auth type detected
 * @private
 * @param {http.IncomingMessage} req
 * @returns {String}
 */
AuthenticateMiddlewareFactory._detectStrategy = function (req) {
  const creds = basicauth(req);
  const basic = creds && creds.name && creds.pass;
  const ecdsa = req.header('x-signature') && req.header('x-pubkey');

  return basic ? 'BASIC' : (ecdsa ? 'ECDSA' : 'NONE');
};

/**
 * Extracts the payload for signature verification
 * @private
 * @param {http.IncomingMessage} req
 * @returns {String}
 */
AuthenticateMiddlewareFactory._getPayload = function (req) {
  if (fromBody.indexOf(req.method) !== -1) {
    return req.rawbody;
  }

  if (fromQuery.indexOf(req.method) !== -1) {
    return url.parse(req.url).query;
  }

  return '';
};

/**
 * Extracts the request parameters
 * @private
 * @param {http.IncomingMessage} req
 * @returns {Object}
 */
AuthenticateMiddlewareFactory._getParams = function (req) {
  if (fromBody.indexOf(req.method) !== -1) {
    return req.body;
  }

  if (fromQuery.indexOf(req.method) !== -1) {
    return req.query;
  }

  return {};
};

AuthenticateMiddlewareFactory._getHash = function (req) {
  let contract = Buffer.from([
    req.method,
    req.path,
    AuthenticateMiddlewareFactory._getPayload(req)
  ].join('\n'), 'utf8');

  return crypto.createHash('sha256').update(contract).digest('hex')
};

AuthenticateMiddlewareFactory._verifySignature = function (req) {
  let signature;
  let sigHeader = req.header('x-signature');
  let pubkey = req.header('x-pubkey');
  let signatureBuf;
  let pubkeyBuf;

  try {
    pubkeyBuf = Buffer.from(pubkey, 'hex');
    signatureBuf = Buffer.from(sigHeader, 'hex');
    signature = secp256k1.signatureImport(signatureBuf);
  } catch (e) {
    return false;
  }

  let hash = AuthenticateMiddlewareFactory._getHash(req);

  return secp256k1.ecdsaVerify(
    secp256k1.signatureNormalize(signature),
    Buffer.from(hash, 'hex'),
    pubkeyBuf
  );
};

module.exports = AuthenticateMiddlewareFactory;
