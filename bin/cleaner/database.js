const { eachSeries, whilst, each, eachLimit } = require('async');

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

const processEntriesSequentially = (entries, onEveryEntry, cb) => {
  if (entries.length === 0) {
    return cb();
  }

  eachLimit(entries, 1, onEveryEntry, cb);
};

function iterateOverCursorSequentially(cursor, onEveryEntry, cb) {
  let chunk = [];
  const chunkSize = 5;

  cursor.once('error', cb);

  cursor.once('end', () => {
    processEntriesSequentially(
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
    processEntriesSequentially(
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

function deleteBucketAndContents({
  BucketEntryModel,
  FrameModel,
  PointerModel,
}, bucket, onPointerDelete, cb) {
  BucketEntryModel.find({
    bucket: bucket.id,
  }).populate('frame').exec((err, entries) => {
    if (err) {
      return cb(err);
    }

    eachSeries(entries, (entry, nextEntry) => {
      entry.remove((err) => {
        if (err) {
          return cb(err);
        }

        FrameModel.findOne({ _id: entry.frame.id }, (err, frame) => {
          if (err) {
            return cb(err);
          }
          PointerModel.find({ _id: { $in: frame.shards } }, (err, pointers) => {
            if (err) {
              return cb(err);
            }

            eachSeries(pointers, (pointer, nextPointer) => {
              pointer.remove((err) => {
                if (err) {
                  return cb(err);
                }
                onPointerDelete(pointer, nextPointer);
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
    }, (err) => {
      if (err) {
        return cb(err);
      } else {
        bucket.remove(cb);
      }
    });
  });
}


module.exports = {
  iterateOverUsers,
  iterateOverCursor,
  iterateOverCursorSequentially,
  getFileCountQuery,
  deleteBucketAndContents,
};
