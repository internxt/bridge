#!/usr/bin/env node

'use strict';

const program = require('commander');
const Storage = require('storj-service-storage-models');
const Config = require('../lib/config');

program.version('0.0.1')
  .option('-c, --config <path_to_config_file>', 'path to the config file')
  .option('-u, --mongourl <mongo connection string>', 'mongo url connection string')
  .parse(process.argv);


async function deleteEmptyMirrors() {
  if (!process.env.NODE_ENV) {
    throw new Error('NODE_ENV is not set');
  }
  try {
    let mongourl;
    if (program.mongourl) {
      mongourl = program.mongourl;
    }

    const config = new Config(process.env.NODE_ENV, program.config, program.datadir);
    const storage = new Storage(
      mongourl || config.storage.mongoUrl,
      config.storage.mongoOpts
    );

    const Mirror = storage.models.Mirror;
    const Shard = storage.models.Shard;

    const stream = Mirror.find()
      .sort({
        '_id': 1
      })
      .stream();

    stream.on('data', mirror => {
      stream.pause();
      const shardHash = mirror.shardHash;
      Shard.findOne({ hash: shardHash }).exec((err, shard) => {
        if (err) {
          console.log('Error getting shard', shardHash);
          stream.resume();

          return;
        }
        if (shard === null) {
          mirror.remove(err => {
            if (err) {
              console.log('Error deleting mirror', mirror.id);
              stream.resume();

              return;
            }
            console.log('Mirror removed: ', mirror.id);
            stream.resume();
          });

          return;
        }
        stream.resume();
      });
    });

    stream.on('end', () => {
      // TODO:
      // disconnect from mongo, finish script
    });
  } catch (err) {
    console.error(err);
  }
}


deleteEmptyMirrors();
