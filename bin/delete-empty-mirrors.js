#!/usr/bin/env node

'use strict';

const program = require('commander');
const Storage = require('storj-service-storage-models');
const mongoose = require('mongoose');
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
    let deleteCount = 0;

    if (program.mongourl) {
      mongourl = program.mongourl;
    }

    const config = new Config(process.env.NODE_ENV, program.config);
    const storage = new Storage(
      mongourl || config.storage.mongoUrl,
      config.storage.mongoOpts
    );

    const Mirror = storage.models.Mirror;
    const Shard = storage.models.Shard;

    const cursor = Mirror.find()
      .sort({
        '_id': 1
      })
      .cursor();

    const chunkOfMirrors = [];
    const chunkSize = 5;

    cursor.on('data', mirror => {
      chunkOfMirrors.push(mirror);
      if (chunkOfMirrors.length === chunkSize) {
        cursor.pause();
      }
    });

    cursor.on('pause', async () =>{
      for (const mirror of chunkOfMirrors) {
        try {
          const { shardHash } = mirror;
          const shard = await Shard.findOne({ hash: shardHash });
          if (!shard) {
            await mirror.remove();
            console.log('deleted mirror: ', mirror._id);
            deleteCount += 1;
          }
        } catch (err) {
          console.error('Error processing mirror: ', mirror._id);
          console.error('Error: ', err.message);
          cursor.close();
        }
      }
      cursor.resume();
    });

    cursor.on('end', () => {
      mongoose.disconnect();
      console.log('Finished processing.');
      console.log('Mirrors deleted: ', deleteCount);
    });

  } catch (err) {
    console.error('Unexpected error during audit');
    console.error(err.message);
  }
}


deleteEmptyMirrors();
