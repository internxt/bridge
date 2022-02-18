#!/usr/bin/env node

'use strict';

const program = require('commander');
const Storage = require('storj-service-storage-models');
const mongoose = require('mongoose');
const sqlDriver = require('mysql');
const Config = require('../../lib/config');
const { deleteFile } = require('./requests');
const { iterateOverUsers, getFileCountQuery, iterateOverModel } = require('./database');

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
  .option('-u, --mongourl <mongo connection string>', 'mongo url connection string')
  .option('-b, --bridgeEndpoint <bridge url>', 'bridge endpoint url')
  .option('-s, --startFromUser <last processed user id>', 'last user id from where to continue')
  .option('-U, --deleteUnreferencedFilesFromUser', 'specifies to delete unreferenced files from user')
  .option('-B, --deleteUnreferencedFilesFromBackups', 'specifies to delete unreferenced files from backups')
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

if (
  !program.deleteUnreferencedFilesFromUser &&
  !program.deleteUnreferencedFilesFromBackups
) {
  throw new Error(
    'You must specify which files to delete either from backups (-B) or from users (-U)'
  );
}

if (
  program.deleteUnreferencedFilesFromUser &&
  program.deleteUnreferencedFilesFromBackups
) {
  throw new Error(
    'You must specify which files to delete either from backups (-B) or from users (-U). But not both'
  );
}

let mongourl;
let startFromUser;
let idUserBeingChecked;
let deletedFiles = 0;
let checkedUsers = 0;

const bridgeEndpoint = program.bridgeEndpoint;
if (program.mongourl) {
  mongourl = program.mongourl;
}
if (program.startFromUser) {
  startFromUser = program.startFromUser;
}

const sqlPool = sqlDriver.createPool(program.dburl);
const config = new Config(process.env.NODE_ENV, program.config);
const storage = new Storage(
  mongourl || config.storage.mongoUrl,
  config.storage.mongoOpts
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

let sqlUsersQuery;
let sqlFilesQuery;

function deleteUnreferencedFilesEntryPoint(cb) {
  let startFromUserClause = '';
  if (startFromUser) {
    startFromUserClause = `WHERE users.id >= ${startFromUser}`;
  }

  if (program.deleteUnreferencedFilesFromUser) {
    deleteUnreferencedFilesFromUser(startFromUserClause, cb);
  } else if (program.deleteUnreferencedFilesFromBackups) {
    deleteUnreferencedFilesFromBackups(startFromUserClause, cb);
  }
}

function deleteUnreferencedFilesFromUser(startFromUserClause, cb) {
  sqlUsersQuery = `
    SELECT users.id AS id_user, users.user_id AS password, users.bridge_user AS bridge_user, folders.bucket AS id_bucket 
    FROM users 
    INNER JOIN folders 
    ON users.root_folder_id = folders.id 
    ${startFromUserClause}
    ORDER BY users.id ASC
    LIMIT ?
    OFFSET ? ;`;

  sqlFilesQuery = `
    SELECT count(*) as count FROM files
    WHERE files.file_id = ? ;`;

  deleteUnreferencedFiles(cb);
}

function deleteUnreferencedFilesFromBackups(startFromUserClause, cb) {
  sqlUsersQuery = `
    SELECT users.id AS id_user, users.user_id AS password, users.bridge_user AS bridge_user, users.backups_bucket as id_bucket 
    FROM users 
    ${startFromUserClause}
    ORDER BY users.id ASC
    LIMIT ?
    OFFSET ? ;`;

  sqlFilesQuery = `
    SELECT count(*) as count FROM backups
    WHERE backups.fileId = ? ;`;

  deleteUnreferencedFiles(cb);
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

      iterateOverModel(
        BucketEntryModel,
        { bucket: idBucket },
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
