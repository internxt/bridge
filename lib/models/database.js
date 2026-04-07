'use strict';

const assert = require('assert');
const mongoose = require('mongoose');

/**
 * MongoDB storage interface
 * @constructor
 * @param {String} mongoURI
 * @param {Object} mongoOptions
 * @param {Object} storageOptions
 */
function Database(mongoURI, mongoOptions, storageOptions) {
  if (!(this instanceof Database)) {
    return new Database(mongoURI, mongoOptions, storageOptions);
  }

  assert(typeof mongoOptions === 'object', 'Invalid mongo options supplied');

  this._uri = mongoURI;
  this._options = mongoOptions;
  this._log = (storageOptions && storageOptions.logger) || {
    info: console.log,
    debug: console.log,
    error: console.error,
    warn: console.warn,
  };

  this._connect();
}

Database.externalModels = require('storj-service-storage-models').models;
Database.localModels = {
  Bucket: require('./bucket'),
  User: require('./user'),
};
Database.constants = require('../constants');

/**
 * Connects to the database
 */
Database.prototype._connect = function () {
  const opts = Object.assign({ ssl: false }, this._options);

  if (opts.server) {
    this._log.warn(
      'Deprecated \'server\' option detected in database configuration. ' +
      'This option was removed in MongoDB driver 4.x and will be ignored. ' +
      'Please remove it from your configuration.'
    );
    delete opts.server;
  }

  this._log.info('opening database connection at %s', this._uri);

  this.connection = mongoose.createConnection(this._uri, opts);

  this.connection.on('error', (err) => {
    this._log.error('database connection error: %s', err.message);
  });

  this.connection.on('disconnected', () => {
    this._log.warn('disconnected from database');
  });

  this.connection.on('connected', () => {
    this._log.info('connected to database');
  });

  this.models = this._createBoundModels();
};

/**
 * Return a dictionary of models bound to this connection
 */
Database.prototype._createBoundModels = function () {
  const bound = {};

  const allModels = {
    ...Database.externalModels,
    ...Database.localModels,
  };

  for (const model in allModels) {
    bound[model] = allModels[model](this.connection);
  }

  return bound;
};

/**
 * Returns a promise that resolves when the connection is ready
 */
Database.prototype.ready = function () {
  return new Promise((resolve, reject) => {
    if (this.connection.readyState === 1) {
      return resolve();
    }
    this.connection.once('connected', resolve);
    this.connection.once('error', reject);
  });
};

/**
 * Creates a Database instance from a config object
 * @param {Object} storageConfig - { mongoUrl, mongoOpts }
 * @param {Object} [logger]
 */
Database.createFromConfig = function (storageConfig, logger) {
  return new Database(
    storageConfig.mongoUrl,
    storageConfig.mongoOpts,
    logger ? { logger } : {}
  );
};

module.exports = Database;
