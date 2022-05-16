import { v4 } from 'uuid';
import { createHash } from 'crypto';

import { BucketEntry, BucketEntryWithFrame } from "../../../../lib/core/bucketEntries/BucketEntry";
import { Pointer } from "../../../../lib/core/pointers/Pointer";
import { Frame } from '../../../../lib/core/frames/Frame';
import { BucketEntryShard } from '../../../../lib/core/bucketEntryShards/BucketEntryShard';
import { Bucket } from '../../../../lib/core/buckets/Bucket';
import { User } from '../../../../lib/core/users/User';

function getBucketEntriesWithFrames(fileIds?: string[]): BucketEntryWithFrame[] {
  const ids = fileIds ?? [v4()];
  const pointers = [getPointer(), getPointer()]

  return getBucketEntriesWithoutFrames(ids).map(be => {
    return {
      ...be,
      frame: getFrame({
        shards: pointers.map(p => p.id)
      })
    }
  });
};

function getBucketEntriesWithoutFrames(fileIds?: string[]): (BucketEntry & { frame?: Frame })[] {
  const ids = fileIds ?? [v4()];

  return ids.map(fId => {
    const be = getBucketEntry({ id: fId });

    delete be.frame;

    return be as (BucketEntry & { frame?: Frame });
  });
}

function getBucket(customBucket?: Partial<Bucket>): Bucket {
  const defaultBucket: Bucket = {
    encryptionKey: '',
    id: v4(),
    name: '',
    status: '',
    storage: 0,
    transfer: 0,
    user: ''
  };

  return { ...defaultBucket, ...customBucket };
}

function getBucketEntry(customBucketEntry?: Partial<BucketEntry>): BucketEntry {
  const defaultBucketEntry: BucketEntry = {
    bucket: v4(),
    id: v4(),
    index: 'index',
    name: 'name',
    frame: v4(),
    size: 0,
    version: 1
  };

  return { ...defaultBucketEntry, ...customBucketEntry };
}

function getBucketEntryShard(customBucketEntryShard?: Partial<BucketEntryShard>): BucketEntryShard {
  const defaultBucketEntry: BucketEntryShard = {
    id: v4(),
    index: 0,
    bucketEntry: v4(),
    shard: v4()
  };

  return { ...defaultBucketEntry, ...customBucketEntryShard };
}

function getFrame(customFrame?: Partial<Frame>): Frame {
  const defaultFrame: Frame = {
    bucketEntry: v4(),
    id: v4(),
    locked: false,
    shards: [],
    size: 0,
    storageSize: 0,
    user: ''
  };

  return { ...defaultFrame, ...customFrame };
}

function getPointer(customPointer?: Partial<Pointer>): Pointer {
  const defaultPointer: Pointer = {
    frame: v4(),
    hash: createHash('ripemd160').update(v4()).digest('hex'),
    id: v4(),
    index: 0,
    parity: false,
    size: 0,
    challenges: [],
    tree: []
  };

  return { ...defaultPointer, ...customPointer };
}

function getUser(customUser?: Partial<User>): User {
  const defaultUser: User = {
    id: v4(),
    activated: true,
    activator: '',
    deactivator: '',
    hashpass: '',
    isFreeTier: true,
    maxSpaceBytes: 0,
    password: '',
    resetter: '',
    totalUsedSpaceBytes: 0,
    uuid: v4(),
    migrated: false
  };

  return { ...defaultUser, ...customUser };
}

export default {
  getBucketEntriesWithFrames,
  getBucketEntriesWithoutFrames,
  getBucketEntry,
  getBucketEntryShard,
  getFrame,
  getPointer,
  getBucket,
  getUser
};
