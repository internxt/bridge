import { v4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';

import { BucketEntry, BucketEntryWithFrame } from "../../../lib/core/bucketEntries/BucketEntry";
import { Pointer } from "../../../lib/core/pointers/Pointer";
import { Frame } from '../../../lib/core/frames/Frame';
import { BucketEntryShard } from '../../../lib/core/bucketEntryShards/BucketEntryShard';
import { Bucket } from '../../../lib/core/buckets/Bucket';
import { User } from '../../../lib/core/users/User';
import { Shard } from '../../../lib/core/shards/Shard';
import { Contact } from '../../../lib/core/contacts/Contact';

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
    userId: v4(),
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
    user: '',
    created: new Date(),
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
    email: v4() + '@gmail.com',
    activator: '',
    deactivator: v4(),
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

function getShard(custom?: Partial<Shard>, contactId?: Contact['id']): Shard {
  const hash = randomBytes(40).toString('hex');
  const nodeID = contactId ? contactId : `nodeID-${v4()}`;

  const defaultShard: Shard = {
    contracts: [
      {
        nodeID,
        contract: {
          data_hash: hash,
          data_size: 0,
          farmer_id: nodeID,
          version: 1,
          store_begin: new Date(),
        }
      }
    ],
    hash,
    id: `shard-id-${v4()}`,
    size: 0,
    uuid: `shard-uuid-${v4()}`
  }

  return {
    ...defaultShard, ...custom
  };
}

function getContact(custom?: Partial<Contact>): Contact {
  const defaultContact: Contact = {
    address: `http://${randomBytes(10).toString('hex')}.com`,
    id: v4(),
    ip: 'http://1.1.1.1',
    lastSeen: new Date(),
    lastTimeout: new Date(),
    port: 3000,
    protocol: '1.2.0-INXT',
    reputation: 5000,
    responseTime: 2,
    spaceAvailable: true,
    timeoutRate: 0,
    userAgent: '',
    objectCheckNotRequired: false
  };

  return { ...defaultContact, ...custom };
}

export default {
  getBucketEntriesWithFrames,
  getBucketEntriesWithoutFrames,
  getBucketEntry,
  getBucketEntryShard,
  getFrame,
  getPointer,
  getBucket,
  getUser,
  getShard,
  getContact
};
