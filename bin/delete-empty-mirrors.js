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

    let idMirrorBeingDeleted;

    cursor.on('pause', () =>{
      for (const mirror of chunkOfMirrors) {
        idMirrorBeingDeleted = mirror._id;
        const { shardHash } = mirror;
        Shard.findOne({ hash: shardHash }, (err, shard) => {
          if (err) {
            cursor.emit('error', err);

            return;
          }
          if (!shard) {
            mirror.remove((err) => {
              if (err) {
                cursor.emit('error', err);

                return;
              }
              idMirrorBeingDeleted = mirror._id;
              deleteCount += 1;
            });
          }
        });
      }
      cursor.resume();
    });

    const idInterval = setInterval(() => {
      console.log('Deleted mirrors: ', deleteCount);
      if (idMirrorBeingDeleted) {
        console.log('Last mirror deleted: ', idMirrorBeingDeleted);
      }
    }, 4000);

    cursor.once('error', (err) => {
      clearInterval(idInterval);
      console.error('Error processing mirror: ', idMirrorBeingDeleted);
      console.error('Error: ', err.message);
      cursor.close();
    });

    cursor.once('end', () => {
      clearInterval(idInterval);
      mongoose.disconnect();
      console.log('Finished processing, mirrors deleted: ', deleteCount);
      if (deleteCount > 0) {
        console.log('Last mirror deleted: ', idMirrorBeingDeleted);
      }
    });

  } catch (err) {
    console.error('Unexpected error');
    console.error(err.message);
  }
}


deleteEmptyMirrors();
