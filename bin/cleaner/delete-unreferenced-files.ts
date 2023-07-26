#!/usr/bin/env node

'use strict';

import program from 'commander';
import mysql from 'mysql';
import { config as loadEnv } from 'dotenv';

import { deleteFile } from './requests';
import {
  iterateOverUsers,
  getFileCountQuery,
  iterateOverCursor,
  driveRepository,
} from './database';
import Config from '../../lib/config';

loadEnv();

const Storage = require('storj-service-storage-models') as any;

// Example:
// node bin/cleaner/delete-unreferenced-files.js \
// -d mariadb://root:example@localhost:3306/xCloud \
// -u mongodb://admin:password@localhost:27017/__inxt-network \
// -b http://localhost:6382 \
// --deleteUnreferencedFilesFromUser

program
  .version('0.0.1')
  .option('-c, --config <path_to_config_file>', 'path to the config file')
  .option('-d, --dburl <db connection string>', 'sql db connection string')
  .option(
    '-u, --mongourl <mongo connection string>',
    'mongo url connection string'
  )
  .option('-b, --bridgeEndpoint <bridge url>', 'bridge endpoint url')
  .option('-f, --lastFileId <file_id>', 'last checked file id')
  .option(
    '-s, --startFromUser <last processed user id>',
    'last user id from where to continue'
  )
  .parse(process.argv);

if (!process.env.NODE_ENV) {
  throw new Error('NODE_ENV is not set');
}

if (!program.dburl) {
  throw new Error('Add the DB connection string as -d or --dburl');
}

if (!program.bridgeEndpoint) {
  throw new Error('Add the bridge URL as -b or --bridgeendpoint');
}

let mongourl;
let startFromUser;
let idUserBeingChecked: number;
let deletedFiles = 0;
let checkedUsers = 0;

const bridgeEndpoint = program.bridgeEndpoint;
if (program.mongourl) {
  mongourl = program.mongourl;
}
if (program.startFromUser) {
  startFromUser = program.startFromUser;
}

const sqlPool = mysql.createPool(program.dburl);
const config = new Config(process.env.NODE_ENV, program.config, '') as {
  storage: { mongoUrl: string; mongoOpts: any };
};

console.log('program.mongourl', config.storage.mongoUrl);
console.log('program.dburl', program.dburl);

const storage = new Storage(
  mongourl || config.storage.mongoUrl,
  config.storage.mongoOpts,
  null
);

const { BucketEntry: BucketEntryModel } = storage.models;

const logStatus = () => {
  console.log('Deleted files: ', deletedFiles);
  console.log('Checked users: ', checkedUsers);
  if (idUserBeingChecked) {
    console.log('Id of last user checked: ', idUserBeingChecked);
  }
};

const loggerInterval = setInterval(logStatus, 4000);

const drive = driveRepository(sqlPool);

async function deleteFilesInDriveButNotInTheNetwork() {
  let usersLimit = 5;
  let filesLimit = 20;

  let lastUserId = 0;
  let lastFileId = 0;

  let usersCount = 0;
  let filesCount = 0;

  const users = await drive.getUsers(usersLimit, usersCount, lastUserId);

  for (const user of users) {
    const files = await drive.getFiles(user.id, filesLimit, filesCount, lastFileId);

    for (const file of files) {
      // TODO: Delete file if not found on the network
    }
  }
}

async function deleteFilesInTheNetworkButNotInDrive(
  lastFileId: string,
  lastUserId: number
) {
  let usersLimit = 5;
  let usersCount = 0;
  let filesCount = 0;
  let lastUsersCount = 0;

  let currentUser;
  let currentFile: { _id: string };

  try {
    do {
      const users = await drive.getUsers(usersLimit, usersCount, lastUserId);

      for (const user of users) {
        currentUser = user;

        const buckets = await drive.getUserBuckets(user.id);

        for (const bucket of buckets) {
          const cursor = BucketEntryModel.find({
            bucket,
            _id: {
              $gte: lastFileId,
            },
          })
            .sort({ _id: 1 })
            .cursor();

          await iterateOverCursor(cursor, async (bucketEntry: any) => {
            currentFile = bucketEntry;
            const file = await drive.getFileByNetworkFileId(bucketEntry._id);

            if (!file) {
              // DELETE FROM NETWORK
              deletedFiles++;
            }
          });
        }
        checkedUsers++;
      }

      usersCount += users.length;
      lastUsersCount = users.length;
    } while (lastUsersCount === usersLimit);
  } catch (err) {
    console.log(err);
    console.log(
      'Error removing file %s of user %s: %s',
      currentFile!._id,
      currentUser.id,
      (err as Error).message
    );
    console.error((err as Error).stack);
  } finally {
    console.log(
      'Program finished. %s users deleted %s. %s files deleted',
      usersCount,
      filesCount
    );
    console.log(
      'Last file deleted: %s (from user %s)',
      currentFile!._id,
      currentUser.id
    );
  }
}

const checkBucketEntry = (
  entry,
  { idBucket, username, password },
  cb
) => {
  const idFile = entry._id.toString();

  getFileCountQuery(
    sqlPool,
    sqlFilesQuery,
    idFile,
    (err, count) => {
      if (err) {
        return cb(err);
      }
      if (count > 0) {
        return cb();
      }
      // There are no files referencing this bucket entry, we should delete it:
      deleteFile({ bridgeEndpoint, idFile, idBucket, username, password }, (err) => {
        if (err) {
          return cb(err);
        }
        deletedFiles += 1;
        cb();
      });
    });
};

function deleteUnreferencedFiles(cb) {
  iterateOverUsers(
    sqlPool,
    sqlUsersQuery,
    (user, nextUser) => {

      const {
        id_user: idUser,
        id_bucket: idBucket,
        bridge_user: username,
        password,
      } = user;

      idUserBeingChecked = idUser;

      const cursor = BucketEntryModel
        .find({
          bucket: idBucket,
        })
        .sort({ _id: 1 })
        .cursor();

      iterateOverCursor(
        cursor,
        (entry, nextBucketEntry) => {
          checkBucketEntry(
            entry,
            { idBucket, username, password },
            nextBucketEntry
          );
        },

        (err) => {
          if (err) {
            return nextUser(err);
          }
          checkedUsers += 1;
          nextUser();
        }
      );
    },
    cb
  );
}

deleteUnreferencedFilesEntryPoint((err) => {
  mongoose.disconnect();
  sqlPool.end();
  clearInterval(loggerInterval);

  let programFinishedMessage = `Program finished. Deleted ${deletedFiles} file(s). Last user checked was ${idUserBeingChecked}`;

  if (err) {
    programFinishedMessage += `Error ${err.message || 'Unknown error'}`;
    console.log(err.stack);
  }
  console.log(programFinishedMessage);
});

deleteFilesInTheNetworkButNotInDrive(
  program.lastFileId || 'aaaaaaaaaaaaaaaaaaaaaaaa',
  program.startFromUser || 1
)
  .then(() => {
    console.log('finished');
  })
  .catch((err) => {
    console.log('err', err);
  })
  .finally(() => {
    clearInterval(loggerInterval);
  });
