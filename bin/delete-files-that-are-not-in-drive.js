#!/usr/bin/env node

'use strict';

const program = require('commander');
const Storage = require('storj-service-storage-models');
const mongoose = require('mongoose');
const async = require('async');
const sqlDriver = require('mysql');
const crypto = require('crypto');

const Config = require('../lib/config');
const axios = require('axios');

// Example:
// node bin/delete-files-that-are-not-in-drive.js \
// -d mariadb://root:example@localhost:3306/xCloud \
// -u mongodb://admin:password@localhost:27017/__inxt-network \
// -b http://localhost:6382

program.version('0.0.1')
  .option('-c, --config <path_to_config_file>', 'path to the config file')
  .option('-d, --dburl <db connection string>', 'sql db connection string')
  .option('-u, --mongourl <mongo connection string>', 'mongo url connection string')
  .option('-b, --bridgeendpoint <bridge url>', 'bridge endpoint url')
  .parse(process.argv);


function deleteFilesThatAreNotInDrive() {
  if (!process.env.NODE_ENV) {
    throw new Error('NODE_ENV is not set');
  }
  try {
    if (!program.dburl) {
      throw new Error('Add the DB connection string as -d or --dburl');
    }

    if (!program.bridgeendpoint) {
      throw new Error('Add the bridge URL as -b or --bridgeendpoint');
    }
    const bridgeEndPoint = program.bridgeendpoint;

    const sqlPool = sqlDriver.createPool(program.dburl);
    const config = new Config(process.env.NODE_ENV, program.config);
    const storage = new Storage(
      program.mongourl || config.storage.mongoUrl,
      config.storage.mongoOpts
    );

    const chunkSize = 5;
    let moreResults = true;
    let page = 0;
    let idUserBeingChecked;
    let deletedFiles = 0;
    let checkedUsers = 0;

    const logStatus = () => {
      console.log('Deleted files: ', deletedFiles);
      console.log('Checked users: ', checkedUsers);
      if (idUserBeingChecked) {
        console.log('Id of last user checked: ', idUserBeingChecked);
      }
    };

    const idInterval = setInterval(logStatus, 4000);

    const stopScript = () => {
      clearInterval(idInterval);
      sqlPool.end();
      mongoose.disconnect();
    };

    const stopScriptAndError = err => {
      console.error('Error processing user: ', idUserBeingChecked);
      console.error('Error: ', err.message);
      stopScript();
    };

    async.whilst(
      (cb) => cb(null, moreResults),
      (cb) => {
        sqlPool.query(`
          SELECT users.id AS id_user, users.user_id AS password, users.bridge_user AS bridge_user, folders.bucket AS id_bucket FROM users 
          INNER JOIN folders 
          ON users.root_folder_id = folders.id 
          ORDER BY users.id ASC
          LIMIT ?
          OFFSET ? ;`,
        [chunkSize, page * chunkSize],
        (err, results) => {
          if (err) {
            stopScriptAndError(err);

            return;
          }

          if (results.length === 0) {
            moreResults = false;

            cb();

            return;
          }

          async.eachSeries(results, (result, nextResult) => {

            const idUser = result.id_user;
            const idBucket = result.id_bucket;
            const username = result.bridge_user;
            const password = result.password;

            idUserBeingChecked = idUser;

            checkBucketEntries(
              { storage, sqlPool },
              { idBucket, username, password, bridgeEndPoint },
              (err, deletedFilesCountLocal) => {
                if (err) {
                  stopScriptAndError(err);

                  return;
                }

                deletedFiles += deletedFilesCountLocal;

                nextResult();
              });
          }, () => {
            checkedUsers+= results.length;
            page += 1;
            cb();
          });
        });
      },
      (err) => {
        if (err) {
          stopScriptAndError(err);

          return;
        }
        console.log('finished');
        logStatus();
        stopScript();
      }
    );

  } catch (err) {
    console.error('Unexpected error');
    console.error(err.message);
  }
}


function checkBucketEntries({ storage, sqlPool }, { idBucket, username, password, bridgeEndPoint }, cb) {
  const BucketEntry = storage.models.BucketEntry;

  let chunkOfBucketEntries = [];
  const chunkSize = 5;
  let deletedFilesCount = 0;

  const cursor = BucketEntry.find({
    'bucket': idBucket
  })
    .sort({
      '_id': 1
    })
    .cursor();

  cursor.on('data', (bucketEntry) => {
    chunkOfBucketEntries.push(bucketEntry);
    if (chunkOfBucketEntries.length === chunkSize) {
      cursor.pause();
    }
  });

  const checkEntry = (entry, cb) => {
    const idFile = entry._id.toString();

    sqlPool.query(`
      SELECT count(*) as count FROM files
      WHERE files.file_id = ? ;`,
    [idFile],
    (err, results) => {
      if (err) {
        cb(err);

        return;
      }
      const count = results[0].count;
      if (count === 0) {
        // There are no files referencing this bucket entry, we should delete it:
        deleteFile({ idBucket, idFile, username, password, bridgeEndPoint }, (err) => {
          if (err) {
            cb(err);

            return;
          }

          deletedFilesCount += 1;

          cb();
        });
      } else {
        cb();
      }
    }
    );
  };

  const checkEntries = (cb) => {
    if (chunkOfBucketEntries.length === 0) {
      cb();

      return;
    }

    async.each(chunkOfBucketEntries, checkEntry, (err) => {
      if (err) {
        cb(err);

        return;
      }
      cb();
    });
  };

  cursor.on('pause', () => {
    checkEntries((err) => {
      if (err) {
        cursor.emit('error', err);

        return;
      }
      chunkOfBucketEntries = [];
      cursor.resume();
    });
  });

  cursor.once('error', cb);

  cursor.once('end', () => {
    checkEntries((err) => {
      if (err) {
        cb(err);

        return;
      }
      cb(null, deletedFilesCount);
    });
  });
}

function deleteFile({ idBucket, idFile, username, password, bridgeEndPoint }, cb) {
  const pwdHash = crypto.createHash('sha256').update(password).digest('hex');
  const credential = Buffer.from(`${username}:${pwdHash}`).toString('base64');

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credential}`,
    },
  };
  axios.delete(`${bridgeEndPoint}/buckets/${idBucket}/files/${idFile}`, params)
    .then(() => {
      cb();
    })
    .catch(cb);
}


deleteFilesThatAreNotInDrive();
