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

const deleteEmptyMirror = async (mirror, onDelete, cb) => {
  const { shardHash } = mirror;
  try {
    const shard = await Shard.findOne({ hash: shardHash });
    if (!shard) {
      await mirror.deleteOne();
      onDelete(cb);
    } else {
      cb();
    }
  } catch (err) {
    return cb(err);
  }
};

const processMirrorChunks = (mirrors, cb) => {
  if (mirrors.length === 0) {
    return cb();
  }

  eachLimit(mirrors, 1, (mirror, next) => {
    idMirrorBeingChecked = mirror._id;

    deleteEmptyMirror(
      mirror,
      (cb) => {
        deleteCount += 1;
        cb();
      },
      (err) => {
        if (err) {
          next(err);
        } else {
          next();
        }
      });
  }, cb);
};

function deleteEmptyMirrors(cb) {
  let chunkOfMirrors = [];
  const chunkSize = 5;

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

  cursor.once('error', cb);

  cursor.once('end', () => {
    // There might be still some mirrors that are not deleted (the ones that are left before hitting the chunkSize):
    processMirrorChunks(chunkOfMirrors, (err) => {
      if (err) {
        return cursor.emit('error', err);
      } else {
        cursor.close();
        cb();
      }
    });
  });

  cursor.on('pause', () => {
    processMirrorChunks(chunkOfMirrors, (err) => {
      if (err) {
        cursor.emit('error', err);
      } else {
        chunkOfMirrors = [];
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
  mongoose.disconnect();
  clearInterval(loggerInterval);

  let programFinishedMessage = `Program finished. Deleted ${deleteCount} mirror(s). Last mirror checked was ${idMirrorBeingChecked}`;

  if (err) {
    programFinishedMessage += `Error ${err.message || 'Unknown error'}`;
    console.log(err.stack);
  }

  console.log(programFinishedMessage);
});
