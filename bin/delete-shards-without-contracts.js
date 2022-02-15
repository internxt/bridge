#!/usr/bin/env node

'use strict';

const program = require('commander');
const Storage = require('storj-service-storage-models');
const mongoose = require('mongoose');
const Config = require('../lib/config');

// Example:
// node bin/delete-shards-without-contracts.js \
// -u mongodb://admin:password@localhost:27017/__inxt-network


program.version('0.0.1')
  .option('-c, --config <path_to_config_file>', 'path to the config file')
  .option('-u, --mongourl <mongo connection string>', 'mongo url connection string')
  .parse(process.argv);


function deleteShardsWithoutContracts() {
  if (!process.env.NODE_ENV) {
    throw new Error('NODE_ENV is not set');
  }
  try {
    const config = new Config(process.env.NODE_ENV, program.config);
    const storage = new Storage(
      program.mongourl || config.storage.mongoUrl,
      config.storage.mongoOpts
    );

    const Shard = storage.models.Shard;

    const cursor = Shard.find()
      .sort({
        '_id': 1
      })
      .cursor();

    let chunkOfShards = [];
    const chunkSize = 5;

    cursor.on('data', (shard) => {
      chunkOfShards.push(shard);
      if (chunkOfShards.length === chunkSize) {
        cursor.pause();
      }
    });

    let idShardBeingChecked;

    let deleteCount = 0;
    let checkedShards = 0;

    const checkAndDeleteShard = (shard, cb) => {
      if (!shard.contracts || shard.contracts.length === 0) {
        shard.remove((err) => {
          if (err) {
            cb(err);

            return;
          }
          deleteCount += 1;
          cb();
        });

        return;
      }

      cb();
    };

    const checkShards = (cb) => {
      if (chunkOfShards.length === 0) {
        cb();

        return;
      }

      let processedItemsOfChunk = 0;

      chunkOfShards.forEach((shard, index, remainingChunks) => {
        checkAndDeleteShard(shard, (err) => {
          if (err) {
            cb(err);

            return;
          }
          checkedShards += 1;
          processedItemsOfChunk += 1;
          if (processedItemsOfChunk === remainingChunks.length) {
            cb();
          }
        });
      });
    };

    cursor.on('pause', () => {
      checkShards((err) => {
        if (err) {
          cursor.emit('error', err);

          return;
        }
        chunkOfShards = [];
        cursor.resume();
      });
    });


    const logStatus = () => {
      console.log('Checked shards: ', checkedShards);
      console.log('Deleted shards: ', deleteCount);
      if (idShardBeingChecked) {
        console.log('Last shard checked: ', idShardBeingChecked);
      }
    };

    const idInterval = setInterval(logStatus, 4000);


    const stopScript = () => {
      clearInterval(idInterval);
      cursor.close();
      mongoose.disconnect();
    };

    const stopScriptAndError = err => {
      console.error('Error processing shard: ', idShardBeingChecked);
      console.error('Error: ', err.message);
      stopScript();
    };

    cursor.once('error', stopScriptAndError);

    cursor.once('end', () => {
      // There might be still some shards that are not deleted (the ones that are left before hitting the chunkSize):
      checkShards((err) => {
        if (err) {
          stopScriptAndError(err);

          return;
        }
        console.log('finished');
        logStatus();
        stopScript();
      });
    });
  } catch (err) {
    console.error('Unexpected error: %s', err.message);
  }
}


deleteShardsWithoutContracts();
