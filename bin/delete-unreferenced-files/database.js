const { eachSeries, whilst, each } = require('async');


function iterateOverUsers(sqlPool, sqlUsersQuery, onEveryUser, finished) {
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
            onEveryUser,
            () => {
              page += 1;
              cb();
            }
          );
        }
      );
    },
    finished
  );
}

function getFileCountQuery(sqlPool, sqlFilesQuery, idFile, cb) {
  sqlPool.query(sqlFilesQuery, [idFile], (err, results) => {
    if (err) {
      return cb(err);
    }
    if (results.length !== 1) {
      return cb(new Error('SQL for files didn\'t return a single row'));
    }

    const count = results[0].count;

    if (typeof count !== 'number') {
      return cb(new Error('SQL for files didn\'t specify a count numeric column'));
    }

    cb(null, count);
  });
}


const processBucketEntries = (bucketEntries, onEveryBucketEntry, cb) => {
  if (bucketEntries.length === 0) {
    return cb();
  }

  each(bucketEntries, onEveryBucketEntry, cb);
};

function iterateOverBucketEntries(BucketEntryModel, idBucket, onEveryBucketEntry, cb) {
  let chunkOfBucketEntries = [];
  const chunkSize = 5;

  const cursor = BucketEntryModel.find({
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
      onEveryBucketEntry,
      (err) => {
        if (err) {
          return cursor.emit('error', err);
        }

        cursor.close();
        cb();
      }
    );
  });

  cursor.on('pause', () => {
    processBucketEntries(
      chunkOfBucketEntries,
      onEveryBucketEntry,
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

module.exports = {
  iterateOverUsers,
  iterateOverBucketEntries,
  getFileCountQuery
};