#!/usr/bin/env node

'use strict';

import program from 'commander';
import sqlDriver from 'mysql';
import Config from '../../lib/config';
import { config as loadEnv } from 'dotenv';
import NetworkMessageQueue from '../../lib/server/queues/networkQueue';
import { DELETING_FILE_MESSAGE } from '../../lib/server/queues/messageTypes';
import {
  iterateOverCursor,
  deleteBucketAndContents,
  driveRepository,
} from './database';

const Storage = require('storj-service-storage-models') as any;

loadEnv();

// Example:
// ts-node bin/cleaner/delete-buckets-for-non-existing-users.ts \
// -d mariadb://root:example@localhost:3306/xCloud \
// -u mongodb://admin:password@localhost:27017/__inxt-network \
// -q amqp://admin:password@localhost:5672

program
  .version('0.0.1')
  .option('-c, --config <path_to_config_file>', 'path to the config file')
  .option('-d, --dburl <db connection string>', 'sql db connection string')
  .option('-u, --mongourl <mongo connection string>', 'mongo url connection string')
  .option('-q, --queueurl <queue connection string>', 'queue url connection string')
  .option('-s, --startFromBucket <bucket id to start script from>', 'bucket id to start script from')
  .parse(process.argv);

const DEFAULT_QUEUE_NAME = 'NETWORK_WORKER_TASKS_QUEUE';

if (!process.env.NODE_ENV) {
  throw new Error('NODE_ENV is not set');
}

if (!program.dburl) {
  throw new Error('Add the DB connection string as -d or --dburl');
}

if (!program.queueurl) {
  throw new Error('Add the Queue connection string as -q or --queueurl');
}

let idBucketBeingChecked: string;
let deletedBuckets = 0;
let checkedBuckets = 0;
let startFromBucket: string;

if (program.startFromBucket) {
  startFromBucket = program.startFromBucket;
}

const sqlPool = sqlDriver.createPool(program.dburl);
const drive = driveRepository(sqlPool);

const networkQueue = new NetworkMessageQueue({
  connection: {
    url: program.queueurl,
  },
  exchange: {
    name: 'exchangeName',
    type: 'direct',
  },
  queue: {
    name: program.queuename || DEFAULT_QUEUE_NAME,
  },
  routingKey: {
    name: 'routingKeyName',
  },
});
const config = new Config(process.env.NODE_ENV, program.config, '') as {
  storage: { mongoUrl: string; mongoOpts: any };
};
const storage = new Storage(
  program.mongourl || config.storage.mongoUrl,
  config.storage.mongoOpts
);

const {
  Bucket: BucketModel,
  BucketEntry: BucketEntryModel,
  Frame: FrameModel,
  Pointer: PointerModel,
} = storage.models;

const logStatus = () => {
  console.log('Deleted buckets: ', deletedBuckets);
  console.log('Checked buckets: ', checkedBuckets);
  if (idBucketBeingChecked) {
    console.log('Id of last bucket checked: ', idBucketBeingChecked);
  }
};

const loggerInterval = setInterval(logStatus, 4000);

const onEveryPointerDeleted = (pointer: any): Promise<void> => {
  return new Promise((resolve, reject) => {
    networkQueue.enqueueMessage(
      {
        type: DELETING_FILE_MESSAGE,
        payload: { key: pointer.hash, hash: pointer.hash },
      },
      (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

const checkBucket = async (bucket: any): Promise<void> => {
  idBucketBeingChecked = bucket._id.toString();
  checkedBuckets += 1;
  const { user: email } = bucket;

  const count = await drive.getUsersOrTeamsWithEmail(email);

  if (count > 0) {
    checkedBuckets += 1;

    return;
  }

  if (count === 0) {
    // There are no users nor teams with this email, we should delete the bucket and everything it contains:
    await deleteBucketAndContents(
      {
        BucketEntryModel,
        FrameModel,
        PointerModel,
      },
      bucket,
      onEveryPointerDeleted
    );
    deletedBuckets += 1;
    checkedBuckets += 1;
  }
};

async function deleteBucketsWithNonExistingUsers(): Promise<void> {
  const findConditions: { _id?: { $gte: string } } = {};

  if (startFromBucket) {
    findConditions._id = { $gte: startFromBucket };
  }

  const cursor = BucketModel.find(findConditions).sort({ _id: 1 }).cursor();

  await iterateOverCursor(cursor, checkBucket);
}

function onProgramFinished(err: Error | void) {
  let programFinishedMessage = `Program finished. Deleted ${deletedBuckets} bucket(s). Last bucket checked was ${idBucketBeingChecked}`;
  if (err) {
    programFinishedMessage += `Error ${err.message || 'Unknown error'}`;
    console.log(err.stack);
  }
  console.log(programFinishedMessage);
}

networkQueue.init((err: Error | null) => {
  if (err) {
    console.error('Error connecting to Queue');
  }

  deleteBucketsWithNonExistingUsers()
    .then(onProgramFinished)
    .catch(onProgramFinished)
    .finally(() => {
      sqlPool.end();
      storage.connection.close();
      clearInterval(loggerInterval);
      networkQueue.close((err: Error | null) => {
        if (err) {
          console.log('Error closing queue: ', err.message);
        }
      });
    });
});
