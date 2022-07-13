import { v4 } from 'uuid';
import { createHash } from 'crypto';

import { BucketEntry, BucketEntryWithFrame } from "../../../../lib/core/bucketEntries/BucketEntry";
import { Pointer } from "../../../../lib/core/pointers/Pointer";
import { Frame } from '../../../../lib/core/frames/Frame';

export function getBucketEntriesWithFrames(fileIds?: string[]): BucketEntryWithFrame[] {
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

export function getBucketEntriesWithoutFrames(fileIds?: string[]): (BucketEntry & { frame?: Frame })[] {
  const ids = fileIds ?? [v4()];

  return ids.map(fId => {
    const be = getBucketEntry({ id: fId });

    delete be.frame;

    return be as (BucketEntry & { frame?: Frame });
  });
}

export function getBucketEntry(customBucketEntry?: Partial<BucketEntry>): BucketEntry {
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

export function getFrame(customFrame?: Partial<Frame>): Frame {
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

export function getPointer(customPointer?: Partial<Pointer>): Pointer {
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