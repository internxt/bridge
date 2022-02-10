#!/usr/bin/env node

'use strict';

const program = require('commander');
const Storage = require('storj-service-storage-models');
const mongoose = require('mongoose');
const async = require('async');
const sqlDriver = require('mysql');

const Config = require('../lib/config');
const NetworkMessageQueue = require('../lib/server/queues/networkQueue');
const { DELETING_FILE_MESSAGE } = require('../lib/server/queues/messageTypes');

// Example:
// node bin/delete-empty-users.js \
// -d mariadb://root:example@localhost:3306/xCloud \
// -u mongodb://admin:password@localhost:27017/__inxt-network \
// -q amqp://admin:password@localhost:5672

program.version('0.0.1')
  .option('-c, --config <path_to_config_file>', 'path to the config file')
  .option('-d, --dburl <db connection string>', 'sql db connection string')
  .option('-u, --mongourl <mongo connection string>', 'mongo url connection string')
  .option('-q, --queueurl <queue connection string>', 'queue url connection string')
  .option('-qn, --queuename <queue name>', 'queue name')
  .parse(process.argv);

const DEFAULT_QUEUE_NAME = 'NETWORK_WORKER_TASKS_QUEUE';

function deleteBucketsWithNonExistingUsers() {
  if (!process.env.NODE_ENV) {
    throw new Error('NODE_ENV is not set');
  }
  try {
    if (!program.dburl) {
      throw new Error('Add the DB connection string as -d or --dburl');
    }

    if (!program.queueurl) {
      throw new Error('Add the Queue connection string as -q or --queueurl');
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

    const Bucket = storage.models.Bucket;

    const cursor = Bucket.find()
      .sort({
        '_id': 1
      })
      .cursor();

    let chunkOfBuckets = [];
    const chunkSize = 5;

    cursor.on('data', (bucket) => {
      chunkOfBuckets.push(bucket);
      if (chunkOfBuckets.length === chunkSize) {
        cursor.pause();
      }
    });

    let idBucketBeingChecked;

    let deleteCount = 0;
    let checkedBuckets = 0;

    const checkBucket = (bucket, cb) => {
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
      function (err, results) {
        if (err) {
          cb(err);

          return;
        }
        const count = results[0].count;
        if (count === 0) {
          // There are no users nor teams with this email, we should delete the bucket and everything it contains:
          deleteBucketAndContents(storage, bucket, networkQueue, (err) => {
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
      });
    };

    const checkBuckets = (cb) => {
      if (chunkOfBuckets.length === 0) {
        cb();

        return;
      }

      let processedItemsOfChunk = 0;

      chunkOfBuckets.forEach((bucket, index, remainingChunks) => {
        checkBucket(bucket, (err) => {
          if (err) {
            cb(err);

            return;
          }
          processedItemsOfChunk += 1;
          if (processedItemsOfChunk === remainingChunks.length) {
            cb();
          }
        });
      });
    };

    cursor.on('pause', () => {
      checkBuckets((err) => {
        if (err) {
          cursor.emit('error', err);

          return;
        }
        chunkOfBuckets = [];
        cursor.resume();
      });
    });


    const logStatus = () => {
      console.log('Checked buckets: ', checkedBuckets);
      console.log('Deleted buckets: ', deleteCount);
      if (idBucketBeingChecked) {
        console.log('Last bucket checked: ', idBucketBeingChecked);
      }
    };

    const idInterval = setInterval(logStatus, 4000);


    const stopScript = () => {
      clearInterval(idInterval);
      cursor.close();
      sqlPool.end();
      mongoose.disconnect();
      // TODO: handle closing of queue and connection (running script only when ready)
      // networkQueue.close();
    };

    const stopScriptAndError = err => {
      console.error('Error processing bucket: ', idBucketBeingChecked);
      console.error('Error: ', err.message);
      stopScript();
    };

    cursor.once('error', stopScriptAndError);

    cursor.once('end', () => {
      // There might be still some buckets that are not deleted (the ones that are left before hitting the chunkSize):
      checkBuckets((err) => {
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
    console.error('Unexpected error');
    console.error(err.message);
  }
}


function deleteBucketAndContents(storage, bucket, networkQueue, cb) {
  const BucketEntry = storage.models.BucketEntry;
  const Frame = storage.models.Frame;
  const Pointer = storage.models.Pointer;

  BucketEntry.find({
    bucket: bucket._id,
  }).populate('frame').exec((err, entries) => {
    if (err) {
      cb(err);

      return;
    }

    async.eachSeries(entries, (entry, nextEntry) => {
      entry.remove((err) => {
        if (err) {
          cb(err);

          return;
        }

        Frame.findOne({ _id: entry.frame.id }, (err, frame) => {
          if (err) {
            cb(err);

            return;
          }
          Pointer.find({ _id: { $in: frame.shards } }, (err, pointers) => {
            if (err) {
              cb(err);

              return;
            }

            async.eachSeries(pointers, (pointer, nextPointer) => {
              pointer.remove((err) => {
                if (err) {
                  cb(err);

                  return;
                }

                networkQueue.enqueueMessage({
                  type: DELETING_FILE_MESSAGE,
                  payload: { hash: pointer.hash }
                }, (err) => {
                  if (err) {
                    console.log(`Error adding deleting task to the queue of shard ${pointer.shard} ${err.message}`);
                    cb(err);

                    return;
                  }
                  console.log('Job sent to delete shard: ', pointer.hash);
                });

                nextPointer();
              }, () => {
                frame.remove((err) => {
                  if (err) {
                    cb(err);
                  }

                });
              });
            }, nextEntry);
          });
        });
      });
    }, () => {
      bucket.remove(err => {
        if (err) {
          cb(err);

          return;
        }

        cb();
      });
    });
  });
}

deleteBucketsWithNonExistingUsers();
