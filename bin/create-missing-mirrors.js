#!/usr/bin/env node

'use strict';

const program = require('commander');
const Storage = require('storj-service-storage-models');
const mongoose = require('mongoose');
const { eachLimit } = require('async');
const Config = require('../lib/config');
const { ObjectId } = require('mongodb');

program
  .version('0.0.1')
  .option('-c, --config <path_to_config_file>', 'path to the config file')
  .option(
    '-u, --mongourl <mongo connection string>',
    'mongo url connection string'
  )
  .option(
    '-m, --lastShard <last checked shard>',
    'last checked shard from where to continue'
  )
  .parse(process.argv);

if (!process.env.NODE_ENV) {
  throw new Error('NODE_ENV is not set');
}

let mongourl;
let checkedCount = 0;
let createdCount = 0;
let idShardBeingChecked;
let lastShard;

if (program.mongourl) {
  mongourl = program.mongourl;
}

if (program.lastShard) {
  lastShard = program.lastShard;
}

const config = new Config(process.env.NODE_ENV, program.config);
const storage = new Storage(
  mongourl || config.storage.mongoUrl,
  config.storage.mongoOpts
);

const { Shard, Mirror } = storage.models;

const logStatus = () => {
  console.log(
    'Checked shards: ',
    checkedCount,
    ' Created mirrors: ',
    createdCount
  );
  if (idShardBeingChecked) {
    console.log('Last shard checked: ', idShardBeingChecked);
  }
};

const loggerInterval = setInterval(logStatus, 4000);

const checkShard = (shard, onCreated, cb) => {
  const { hash } = shard;
  if (!hash) {
    return cb();
  }

  Mirror.findOne({ shardHash: hash }, (err, mirror) => {
    if (err) {
      return cb(err);
    }

    if (!mirror) {
      let contract;
      let nodeID;
      if (shard.contracts?.length > 0) {
        contract = shard.contracts[0].contract;
        nodeID = shard.contracts[0].nodeID;
      } else {
        return cb();
      }

      const newMirror = new Mirror({
        shardHash: shard.hash,
        contact: nodeID,
        contract,
        isEstablished: true,
      });

      newMirror.save((err) => {
        if (err) {
          cb(err);
        } else {
          onCreated(cb);
        }
      });
    } else {
      cb();
    }
  });
};

const processShardChunks = (shards, cb) => {
  if (shards.length === 0) {
    return cb();
  }

  eachLimit(
    shards,
    1000,
    (shard, next) => {
      idShardBeingChecked = shard._id;
      checkedCount += 1;

      checkShard(
        shard,
        (cb) => {
          createdCount += 1;
          cb();
        },
        (err) => {
          if (err) {
            next(err);
          } else {
            next();
          }
        }
      );
    },
    cb
  );
};

function createMissingMirrors(cb) {
  let chunkOfShards = [];
  const chunkSize = 20000;

  const filter = {};

  if (lastShard) {
    filter._id = { $lt: new ObjectId(lastShard) };
  }

  const cursor = Shard.find(filter)
    .sort({
      _id: -1,
    })
    .cursor();

  cursor.once('error', cb);

  cursor.once('end', () => {
    processShardChunks(chunkOfShards, (err) => {
      if (err) {
        return cursor.emit('error', err);
      } else {
        cursor.close();
        cb();
      }
    });
  });

  cursor.on('pause', () => {
    processShardChunks(chunkOfShards, (err) => {
      if (err) {
        cursor.emit('error', err);
      } else {
        chunkOfShards = [];
        cursor.resume();
      }
    });
  });

  cursor.on('data', (shard) => {
    chunkOfShards.push(shard);
    if (chunkOfShards.length === chunkSize) {
      cursor.pause();
    }
  });
}

createMissingMirrors((err) => {
  mongoose.disconnect();
  clearInterval(loggerInterval);

  let programFinishedMessage = `Program finished. Checked ${checkedCount} shard(s). Created ${createdCount} mirrors. Last shard checked was ${idShardBeingChecked}`;

  if (err) {
    programFinishedMessage += `Error ${err.message || 'Unknown error'}`;
    console.log(err.stack);
  }

  console.log(programFinishedMessage);
});
