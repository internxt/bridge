'use strict';

const log = require('../../logger');

const { DELETING_FILE_MESSAGE } = require('../queues/messageTypes');

class InvalidParamsError extends Error {
  constructor() {
    super('Missing required params');

    Object.setPrototypeOf(this, InvalidParamsError.prototype);
  }
}

class MissingStorageModelsError extends Error {
  constructor() {
    super('Missing required storage models');

    Object.setPrototypeOf(this, MissingStorageModelsError.prototype);
  }
}

class BucketNotFoundError extends Error {
  constructor() {
    super('Bucket not found');

    Object.setPrototypeOf(this, BucketNotFoundError.prototype);
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message? `Forbidden: ${message}`: 'Forbidden');

    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

class FileNotFoundError extends Error {
  constructor() {
    super('File not found');

    Object.setPrototypeOf(this, FileNotFoundError.prototype);
  }
}

// eslint-disable-next-line complexity
async function removeFile(
  storage,
  { bucketId, userEmail, idFile },
  { beforePointerIsRemoved = async () => { } }) {
  const { Bucket, BucketEntry, Frame, Pointer } = storage.models;

  if (!Bucket || !BucketEntry || !Frame || !Pointer) {
    throw new MissingStorageModelsError();
  }

  if (!bucketId || !userEmail || !idFile) {
    throw new InvalidParamsError();
  }

  try {
    const bucket = await Bucket.findOne({ _id: bucketId });

    if (!bucket) {
      throw new BucketNotFoundError();
    }

    if (bucket.user !== userEmail) {
      throw new ForbiddenError();
    }

    const bucketEntry = await getBucketEntry(BucketEntry, { bucketId: bucket._id, idFile });

    if (!bucketEntry) {
      throw new FileNotFoundError();
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

async function removeFileAndEnqueueDeletionTask(storage, networkQueue, { bucketId, userEmail, idFile }) {

  const beforePointerIsRemoved = async (pointer) => {
    await enqueueDeleteShardMessage(storage, networkQueue, pointer);
  };

  return removeFile(storage, { bucketId, userEmail, idFile }, {
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
          // We do not reject the error since if we fail to enqueue the message, we don't want requests to fail.
          // reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

function getBucketEntry(BucketEntry, { bucketId, idFile }) {
  return new Promise((resolve, reject) => {
    BucketEntry.findOne({
      bucket: bucketId,
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
  removeFileAndEnqueueDeletionTask,
  getBucketEntry
};