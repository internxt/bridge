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
            (err) => {
              if (err) {
                return cb(err);
              }
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

const processEntries = (entries, onEveryEntry, cb) => {
  if (entries.length === 0) {
    return cb();
  }

  each(entries, onEveryEntry, cb);
};

function iterateOverCursor(cursor, onEveryEntry, cb) {
  let chunk = [];
  const chunkSize = 5;

  cursor.once('error', cb);

  cursor.once('end', () => {
    processEntries(
      chunk,
      onEveryEntry,
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
    processEntries(
      chunk,
      onEveryEntry,
      (err) => {
        if (err) {
          return cursor.emit('error', err);
        }

        chunk = [];
        cursor.resume();
      }
    );
  });

  cursor.on('data', (entry) => {
    chunk.push(entry);
    if (chunk.length === chunkSize) {
      cursor.pause();
    }
  });
}

module.exports = {
  iterateOverUsers,
  iterateOverCursor,
  getFileCountQuery
};
