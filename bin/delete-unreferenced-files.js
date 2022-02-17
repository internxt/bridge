#!/usr/bin/env node

'use strict';

const program = require('commander');
const Storage = require('storj-service-storage-models');
const mongoose = require('mongoose');
const { eachSeries, whilst, each } = require('async');
const sqlDriver = require('mysql');
const crypto = require('crypto');
const axios = require('axios');
const Config = require('../lib/config');

// Example:
// node bin/delete-unreferenced-files.js \
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

const { BucketEntry } = storage.models;

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
    startFromUserClause = `WHERE users.id > ${startFromUser}`;
  }

  if (program.deleteUnreferencedFilesFromUser) {
    deleteUnreferencedFilesFromUser(startFromUserClause, cb);
  }
  if (program.deleteUnreferencedFilesFromBackups) {
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

const processBucketEntries = (bucketEntries, params, onDelete, cb) => {
  if (bucketEntries.length === 0) {
    return cb();
  }

  each(
    bucketEntries,
    (entry, cb) => checkBucketEntry(entry, params, onDelete, cb),
    cb
  );
};

const checkBucketEntry = (
  entry,
  { idBucket, username, password },
  onDelete,
  cb
) => {
  const idFile = entry._id.toString();

  sqlPool.query(sqlFilesQuery, [idFile], (err, results) => {
    if (err) {
      return cb(err);
    }

    const count = results[0].count;
    if (count === 0) {
      // There are no files referencing this bucket entry, we should delete it:
      deleteFile({ idFile, idBucket, username, password }, (err) => {
        if (err) {
          return cb(err);
        }
        onDelete(cb);
      });
    } else {
      cb();
    }
  });
};

function deleteUnreferencedFiles(cb) {
  const chunkSize = 5;
  let page = 0;
  let moreResults = true;

  whilst(
    (cb) => cb(null, moreResults),
    (cb) => {
      sqlPool.query(
        sqlUsersQuery,
        [chunkSize, page * chunkSize],
        (err, results) => {
          if (err) {
            return cb(err);
          }

          if (results.length === 0) {
            moreResults = false;

            return cb();
          }

          eachSeries(
            results,
            (result, nextResult) => {
              const {
                id_user: idUser,
                id_bucket: idBucket,
                bridge_user: username,
                password,
              } = result;

              idUserBeingChecked = idUser;

              checkBucketEntries(
                { idBucket, username, password },
                (err, deletedFilesCountLocal) => {
                  if (err) {
                    return cb(err);
                  }

                  deletedFiles += deletedFilesCountLocal;

                  nextResult();
                }
              );
            },
            () => {
              checkedUsers += results.length;
              page += 1;
              cb();
            }
          );
        }
      );
    },
    cb
  );
}

function checkBucketEntries({ idBucket, username, password }, cb) {
  let chunkOfBucketEntries = [];
  const chunkSize = 5;
  let deletedFilesCount = 0;

  const cursor = BucketEntry.find({
    bucket: idBucket,
  })
    .sort({
      _id: 1,
    })
    .cursor();

  cursor.once('error', cb);

  cursor.once('end', () => {
    processBucketEntries(
      chunkOfBucketEntries,
      { idBucket, username, password },
      (cb) => {
        deletedFilesCount += 1;
        cb();
      },
      (err) => {
        if (err) {
          return cursor.emit('error', err);
        }

        cursor.close();
        cb(null, deletedFilesCount);
      }
    );
  });

  cursor.on('pause', () => {
    processBucketEntries(
      chunkOfBucketEntries,
      { idBucket, username, password },
      (cb) => {
        deletedFilesCount += 1;
        cb();
      },
      (err) => {
        if (err) {
          return cursor.emit('error', err);
        }

        chunkOfBucketEntries = [];
        cursor.resume();
      }
    );
  });

  cursor.on('data', (bucketEntry) => {
    chunkOfBucketEntries.push(bucketEntry);
    if (chunkOfBucketEntries.length === chunkSize) {
      cursor.pause();
    }
  });
}

function deleteFile({ idFile, idBucket, username, password }, cb) {
  const pwdHash = crypto.createHash('sha256').update(password).digest('hex');
  const credential = Buffer.from(`${username}:${pwdHash}`).toString('base64');

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credential}`,
    },
  };
  axios
    .delete(`${bridgeEndpoint}/buckets/${idBucket}/files/${idFile}`, params)
    .then(() => {
      cb();
    })
    .catch(cb);
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
