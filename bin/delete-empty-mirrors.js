#!/usr/bin/env node

'use strict';

const program = require('commander');
const Storage = require('storj-service-storage-models');
const mongoose = require('mongoose');
const { eachLimit } = require('async');
const Config = require('../lib/config');

program.version('0.0.1')
  .option('-c, --config <path_to_config_file>', 'path to the config file')
  .option('-u, --mongourl <mongo connection string>', 'mongo url connection string')
  .option('-m, --lastMirror <last deleted mirror>', 'last deleted mirror from where to continue')
  .parse(process.argv);

if (!process.env.NODE_ENV) {
  throw new Error('NODE_ENV is not set');
}

let mongourl;
let deleteCount = 0;
let idMirrorBeingDeleted;

if (program.mongourl) {
  mongourl = program.mongourl;
}

const config = new Config(process.env.NODE_ENV, program.config);
const storage = new Storage(
  mongourl || config.storage.mongoUrl,
  config.storage.mongoOpts
);

const { Shard, Mirror } = storage.models;

const logStatus = () => {
  console.log('Deleted mirrors: ', deleteCount);
  if (idMirrorBeingDeleted) {
    console.log('Last mirror checked: ', idMirrorBeingDeleted);
  }
};

const loggerInterval = setInterval(logStatus, 4000);

const deleteEmptyMirror = (mirror, cb) => {
  const { shardHash } = mirror;

  Shard.findOne({ hash: shardHash }, (err, shard) => {
    if (err) {
      return cb(err);
    }

    if (!shard) {
      return mirror.remove(cb);
    }

    cb();
  });
};

const deleteEmptyMirrorChunks = (mirrors, cb) => {
  if (mirrors.length === 0) {
    return cb();
  }

  eachLimit(mirrors, 1, (mirror, next) => {
    idMirrorBeingDeleted = mirror._id;

    deleteEmptyMirror(mirror, (err) => {
      if (err) {
        next(err);
      } else {
        deleteCount += 1;
        next();
      }
    });
  }, cb);
};

function deleteEmptyMirrors(cb) {
  let chunkOfMirrors = [];
  const chunkSize = 5;

  const cursor = Mirror.find()
    .sort({
      '_id': 1
    })
    .cursor();

  cursor.once('error', (err) => {
    // close?
    cb(err);
  });

  cursor.once('end', () => {
    // There might be still some mirrors that are not deleted (the ones that are left before hitting the chunkSize):
    deleteEmptyMirrorChunks(chunkOfMirrors, (err) => {
      // TODO: should emit error?
      if (err) {
        return cursor.emit('error', err);
      }
    });
    // emit 'end' == close ?
    cursor.close();
    // mongoose.disconnect();
    cb();
  });

  cursor.on('pause', () => {
    deleteEmptyMirrorChunks(chunkOfMirrors, (err) => {
      if (err) {
        cursor.emit('error', err);
      } else {
        cursor.resume();
      }
    });
  });

  cursor.on('data', (mirror) => {
    chunkOfMirrors.push(mirror);
    if (chunkOfMirrors.length === chunkSize) {
      cursor.pause();
    }
  });
}

deleteEmptyMirrors((err) => {
  clearInterval(loggerInterval);

  let programFinishedMessage = `Program finished. Deleted ${deleteCount} mirrors. Last mirror was ${idMirrorBeingDeleted}.`;

  if (err) {
    programFinishedMessage += `Error ${err.message || 'Unknown error'}`;
    console.log(err.stack);
  }

  console.log(programFinishedMessage);
});
