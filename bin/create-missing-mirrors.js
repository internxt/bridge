#!/usr/bin/env node

'use strict';

const program = require('commander');
const Storage = require('storj-service-storage-models');
const mongoose = require('mongoose');
const { eachLimit } = require('async');
const Config = require('../lib/config');

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
  const { shardHash } = shard;

  if (!shardHash) {
    return cb();
  }

  Mirror.findOne({ hash: shardHash }, (err, mirror) => {
    if (err) {
      return cb(err);
    }

    if (!mirror) {
      let contract;
      let nodeID;
      if (shard.contracts?.length > 0) {
        contract = shard.contracts[0].contract;
        nodeID = shard.contracts[0].nodeID;
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
    1,
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
  const chunkSize = 5;

  const filter = {};

  if (lastShard) {
    filter.id = { $gt: lastShard };
  }

  const cursor = Shard.find(filter)
    .sort({
      _id: 1,
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

  cursor.on('data', (mirror) => {
    chunkOfShards.push(mirror);
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
