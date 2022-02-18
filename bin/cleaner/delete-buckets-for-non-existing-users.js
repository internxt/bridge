#!/usr/bin/env node

'use strict';

const program = require('commander');
const Storage = require('storj-service-storage-models');
const mongoose = require('mongoose');
const sqlDriver = require('mysql');

const Config = require('../../lib/config');
const NetworkMessageQueue = require('../../lib/server/queues/networkQueue');
const { DELETING_FILE_MESSAGE } = require('../../lib/server/queues/messageTypes');
const { iterateOverCursor, deleteBucketAndContents } = require('./database');

// Example:
// node bin/cleaner/delete-buckets-for-non-existing-users.js \
// -d mariadb://root:example@localhost:3306/xCloud \
// -u mongodb://admin:password@localhost:27017/__inxt-network \
// -q amqp://admin:password@localhost:5672

program.version('0.0.1')
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

let idBucketBeingChecked;
let deletedBuckets = 0;
let checkedBuckets = 0;
let startFromBucket;

if (program.startFromBucket) {
  startFromBucket = program.startFromBucket;
}

const sqlPool = sqlDriver.createPool(program.dburl);
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
const config = new Config(process.env.NODE_ENV, program.config);
const storage = new Storage(
  program.mongourl || config.storage.mongoUrl,
  config.storage.mongoOpts
);

const { Bucket: BucketModel, BucketEntry: BucketEntryModel, Frame:FrameModel, Pointer:PointerModel } = storage.models;

const logStatus = () => {
  console.log('Deleted buckets: ', deletedBuckets);
  console.log('Checked buckets: ', checkedBuckets);
  if (idBucketBeingChecked) {
    console.log('Id of last bucket checked: ', idBucketBeingChecked);
  }
};

const loggerInterval = setInterval(logStatus, 4000);

const onEveryPointerDeleted = (pointer, nextPointer) => {
  networkQueue.enqueueMessage({
    type: DELETING_FILE_MESSAGE,
    payload: { hash: pointer.hash }
  }, (err) => {
    if (err) {
      return nextPointer(err);
    }
    console.log('Job sent to delete shard: ', pointer.hash);
    nextPointer();
  });
};

const checkBucket = (bucket, nextBucket) => {
  idBucketBeingChecked = bucket._id;
  checkedBuckets += 1;
  const { user } = bucket;

  sqlPool.query(`
      SELECT SUM(count) as count FROM (
        SELECT id, COUNT(*) AS count FROM users WHERE users.bridge_user = ?
        UNION
        SELECT id, COUNT(*) AS count FROM teams WHERE teams.bridge_user = ?
      ) users_and_teams ;`,
  [user, user],
  (err, results) => {
    if (err) {
      return nextBucket(err);
    }

    const count = results[0].count;

    if (count > 0) {
      checkedBuckets += 1;

      return nextBucket();
    }

    if (count === 0) {
      // There are no users nor teams with this email, we should delete the bucket and everything it contains:
      deleteBucketAndContents({
        BucketEntryModel,
        FrameModel,
        PointerModel,
      },
      bucket,
      onEveryPointerDeleted,
      (err) => {
        if (err) {
          return nextBucket(err);
        }
        deletedBuckets += 1;
        checkedBuckets += 1;
        nextBucket();
      });
    }
  }
  );
};

function deleteBucketsWithNonExistingUsers(cb) {

  let findConditions = {};
  if (startFromBucket) {
    findConditions.where = {
      id: {
        $gte: startFromBucket,
      },
    };
  }

  const cursor = BucketModel
    .find(findConditions)
    .sort({ _id: 1 })
    .cursor();

  iterateOverCursor(
    cursor,
    checkBucket,
    cb
  );
}

networkQueue.init((err) => {
  if (err) {
    console.error('Error connecting to Queue');
  }

  deleteBucketsWithNonExistingUsers(err => {
    sqlPool.end();
    mongoose.disconnect();
    clearInterval(loggerInterval);
    networkQueue.close((err) => {
      if (err) {
        console.log('Error closing queue: ', err.message);
      }
    });

    let programFinishedMessage = `Program finished. Deleted ${deletedBuckets} bucket(s). Last bucket checked was ${idBucketBeingChecked}`;
    if (err) {
      programFinishedMessage += `Error ${err.message || 'Unknown error'}`;
      console.log(err.stack);
    }
    console.log(programFinishedMessage);
  });
});
