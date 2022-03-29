#!/usr/bin/env node

'use strict';

import program from 'commander';
import Config from '../../lib/config';
import { iterateOverCursor } from './database';
import { config as loadEnv } from 'dotenv';

const Storage = require('storj-service-storage-models') as any;

loadEnv();

// Example:
// ts-node bin/cleaner/delete-empty-mirrors.ts \
// -u mongodb://admin:password@localhost:27017/__inxt-network

program
  .version('0.0.1')
  .option('-c, --config <path_to_config_file>', 'path to the config file')
  .option('-u, --mongourl <mongo connection string>', 'mongo url connection string')
  .option('-m, --lastMirror <last deleted mirror>', 'last deleted mirror from where to continue')
  .parse(process.argv);

if (!process.env.NODE_ENV) {
  throw new Error('NODE_ENV is not set');
}

let mongourl;
let deleteCount = 0;
let idMirrorBeingChecked: number;
let lastMirror: string | undefined;

if (program.mongourl) {
  mongourl = program.mongourl;
}

if (program.lastMirror) {
  lastMirror = program.lastMirror;
}

const config = new Config(process.env.NODE_ENV, program.config, '') as {
  storage: { mongoUrl: string; mongoOpts: any };
};
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

async function deleteEmptyMirror(mirror: any, onDelete: Function) {
  const { shardHash } = mirror;
  const shard = await Shard.findOne({ hash: shardHash });
  if (!shard) {
    await mirror.remove();
    await onDelete();
  }
}

async function deleteEmptyMirrors(
  lastMirror: string | undefined
): Promise<void> {
  const findConditions: { _id?: { $gte: string } } = {};

  if (lastMirror) {
    findConditions._id = { $gte: lastMirror };
  }

  const cursor = Mirror.find(findConditions)
    .sort({
      _id: 1,
    })
    .cursor();

  await iterateOverCursor(cursor, async (mirror: any) => {
    idMirrorBeingChecked = mirror._id;

    await deleteEmptyMirror(mirror, () => {
      deleteCount += 1;
    });
  });
}

const finishFunction = (err: Error | void) => {
  let programFinishedMessage = `Program finished. Deleted ${deleteCount} mirror(s). Last mirror checked was ${idMirrorBeingChecked}`;
  if (err) {
    programFinishedMessage += `Error ${err.message || 'Unknown error'}`;
    console.log(programFinishedMessage);
    console.log(err.stack);
  }
  console.log(programFinishedMessage);
};

deleteEmptyMirrors(lastMirror)
  .then(finishFunction)
  .catch(finishFunction)
  .finally(() => {
    storage.connection.close();
    clearInterval(loggerInterval);
  });
