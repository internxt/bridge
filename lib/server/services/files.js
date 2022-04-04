'use strict';

const errors = require('storj-service-error-types');
const log = require('../../logger');

const { DELETING_FILE_MESSAGE } = require('../queues/messageTypes');

// eslint-disable-next-line complexity
async function removeFile(
  storage,
  { idBucket, userEmail, idFile },
  { beforePointerIsRemoved = async () => { } }) {
  const { Bucket, BucketEntry, Frame, Pointer } = storage.models;

  if (!Bucket || !BucketEntry || !Frame || !Pointer) {
    throw new errors.InternalError('Missing required storage models');
  }

  if (!idBucket || !userEmail || !idFile) {
    throw new errors.InternalError('Missing required params');
  }

  try {
    const bucket = await Bucket.findOne({ _id: idBucket });

    if (!bucket) {
      throw new errors.NotFoundError('Bucket not found');
    }

    if (bucket.user !== userEmail) {
      throw new errors.ForbiddenError();
    }

    const bucketEntry = await getBucketEntry(BucketEntry, { idBucket: bucket._id, idFile });

    if (!bucketEntry) {
      throw new errors.NotFoundError('File not found');
    }

    const frame = await Frame.findOne({ _id: bucketEntry.frame.id });

    if (!frame) {
      log.error('Frame %s not found for file %s', bucketEntry.frame.id, bucketEntry._id);

      return bucketEntry.remove();
    }

    const pointers = await Pointer.find({ _id: { $in: frame.shards } });

    for (const pointer of pointers) {
      await beforePointerIsRemoved(pointer);
      await pointer.remove();
    }

    await frame.remove();
    await bucketEntry.remove();
  } catch (err) {
    log.error('Error deleting file %s: %s. %s', idFile, err.message, err.stack);

    throw err;
  }
}

async function removeFileAndEnqueueDeletionTask(storage, networkQueue, { idBucket, userEmail, idFile }) {

  const beforePointerIsRemoved = async (pointer) => {
    await enqueueDeleteShardMessage(storage, networkQueue, pointer);
  };

  await removeFile(storage, { idBucket, userEmail, idFile }, {
    beforePointerIsRemoved
  });
}


async function enqueueDeleteShardMessage(storage, networkQueue, pointer) {
  const { Mirror } = storage.models;

  if (!Mirror) {
    throw new Error('Missing Mirror model');
  }
  const { hash } = pointer;

  const mirrors = await Mirror.find({ shardHash: hash }).populate('contact').exec();
  const stillExistentMirrors = mirrors.filter((mirror) => {
    return mirror.contact && mirror.contact.address && mirror.contact.port;
  });

  for (const mirror of stillExistentMirrors) {
    const { address, port } = mirror.contact;

    const url = `http://${address}:${port}/shards/${hash}`;

    await new Promise((resolve, reject) => {
      networkQueue.enqueueMessage({
        type: DELETING_FILE_MESSAGE,
        payload: { hash, url }
      }, (err) => {
        if (err) {
          log.error(
            'deletePointer: Error enqueueing pointer %s shard %s deletion task: %s',
            pointer._id,
            pointer.shard,
            err.message
          );
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

function getBucketEntry(BucketEntry, { idBucket, idFile }) {
  return new Promise((resolve, reject) => {
    BucketEntry.findOne({
      bucket: idBucket,
      _id: idFile
    }).populate('frame').exec((err, entry) => {
      if (err) {
        reject(err);
      } else {
        resolve(entry);
      }
    });
  });
}

module.exports = {
  removeFile,
  removeFileAndEnqueueDeletionTask
};