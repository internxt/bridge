#!/usr/bin/env node

'use strict';

const program = require('commander');
const Storage = require('storj-service-storage-models');
const mongoose = require('mongoose');
const Config = require('../../lib/config');
const { iterateOverCursorSequentially } = require('./database');

// Example:
// node bin/cleaner/delete-empty-mirrors.js \
// -u mongodb://admin:password@localhost:27017/__inxt-network

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
let idMirrorBeingChecked;
let lastMirror;

if (program.mongourl) {
  mongourl = program.mongourl;
}

if (program.lastMirror) {
  lastMirror = program.lastMirror;
}

const config = new Config(process.env.NODE_ENV, program.config);
const storage = new Storage(
  mongourl || config.storage.mongoUrl,
  config.storage.mongoOpts
);

const { Shard, Mirror } = storage.models;

const logStatus = () => {
  console.log('Deleted mirrors: ', deleteCount);
  if (idMirrorBeingChecked) {
    console.log('Last mirror checked: ', idMirrorBeingChecked);
  }
};

const loggerInterval = setInterval(logStatus, 4000);

const deleteEmptyMirror = (mirror, onDelete, cb) => {
  const { shardHash } = mirror;
  Shard.findOne({ hash: shardHash }, (err, shard) => {
    if (err) {
      return cb(err);
    }

    if (!shard) {
      mirror.remove(err => {
        if (err) {
          cb(err);
        } else {
          onDelete(cb);
        }
      });
    } else {
      cb();
    }
  });
};


function deleteEmptyMirrors(cb) {
  const filter = {};

  if (lastMirror) {
    filter.id = { $gt: lastMirror };
  }

  const cursor = Mirror
    .find(filter)
    .sort({
      '_id': 1
    })
    .cursor();

  iterateOverCursorSequentially(
    cursor,
    (mirror, nextMirror) => {
      idMirrorBeingChecked = mirror._id;

      deleteEmptyMirror(
        mirror,
        (innerCb) => {
          deleteCount += 1;
          innerCb();
        },
        nextMirror
      );
    },
    cb
  );
}

deleteEmptyMirrors((err) => {
  mongoose.disconnect();
  clearInterval(loggerInterval);

  let programFinishedMessage = `Program finished. Deleted ${deleteCount} mirror(s). Last mirror checked was ${idMirrorBeingChecked}`;

  if (err) {
    programFinishedMessage += `Error ${err.message || 'Unknown error'}`;
    console.log(err.stack);
  }

  console.log(programFinishedMessage);
});
