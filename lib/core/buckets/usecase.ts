import axios from 'axios';
import { v4 } from 'uuid';

import { Bucket } from './Bucket';
import { Frame } from '../frames/Frame';
import { Shard } from '../shards/Shard';
import { BucketEntry } from '../bucketEntries/BucketEntry';
import { BucketEntryShard } from '../bucketEntryShards/BucketEntryShard';

import { BucketEntriesRepository } from '../bucketEntries/Repository';
import { BucketEntryShardsRepository } from '../bucketEntryShards/Repository';
import { FramesRepository } from '../frames/Repository';
import { MirrorsRepository } from '../mirrors/Repository';
import { ShardsRepository } from '../shards/Repository';
import { BucketsRepository } from './Repository';
import { UploadsRepository } from '../uploads/Repository';
import { UsersRepository } from '../users/Repository';
import { UserNotFoundError } from '../users';

export class BucketEntryNotFoundError extends Error {
  constructor(bucketEntryId?: string) {
    super(`Bucket entry ${bucketEntryId || ''} not found`);

    Object.setPrototypeOf(this, BucketEntryNotFoundError.prototype);
  }
}

export class BucketNotFoundError extends Error {
  constructor(bucketId?: string) {
    super(`Bucket ${bucketId || ''} not found`);

    Object.setPrototypeOf(this, BucketNotFoundError.prototype);
  }
}

export class BucketEntryFrameNotFoundError extends Error {
  constructor() {
    super('Frame not found');

    Object.setPrototypeOf(this, BucketEntryFrameNotFoundError.prototype);
  }
}

export class BucketForbiddenError extends Error {
  constructor() {
    super('Unauthorized');

    Object.setPrototypeOf(this, BucketForbiddenError.prototype);
  }
}

export class MissingUploadsError extends Error {
  constructor() {
    super('Missing uploads to complete the upload');

    Object.setPrototypeOf(this, MissingUploadsError.prototype);
  }
}

export class MaxSpaceUsedError extends Error {
  constructor() {
    super('Max space used');

    Object.setPrototypeOf(this, MaxSpaceUsedError.prototype);
  }
}

export class BucketsUsecase {
  constructor(
    private bucketEntryShardsRepository: BucketEntryShardsRepository,
    private bucketEntriesRepository: BucketEntriesRepository,
    private mirrorsRepository: MirrorsRepository,
    private framesRepository: FramesRepository,
    private shardsRepository: ShardsRepository,
    private bucketsRepository: BucketsRepository,
    private uploadsRepository: UploadsRepository,
    private usersRepository: UsersRepository
  ) {}

  async getFileInfo(bucketId: Bucket['id'], fileId: BucketEntry['id']): Promise<
    Omit<BucketEntry, 'frame'> & { shards: any[] } | 
    BucketEntry & { frame: Frame['id'], size: Frame['size'] }
  > {
    const bucketEntry = await this.bucketEntriesRepository.findOneWithFrame({
      bucket: bucketId,
      id: fileId
    });

    if (!bucketEntry) {
      throw new BucketEntryNotFoundError();
    }

    if (bucketEntry.version && bucketEntry.version === 2) {
      const downloadLinks = await this.getBucketEntryDownloadLinks(bucketEntry.id);

      return { ...bucketEntry, shards: downloadLinks };
    }

    if (!bucketEntry.frame) {
      throw new BucketEntryFrameNotFoundError();
    }

    return { ...bucketEntry, frame: bucketEntry.frame.id, size: bucketEntry.frame.size };
  }

  async getBucketEntryDownloadLinks(bucketEntryId: BucketEntry['id']): Promise<{
    index: BucketEntryShard['index'],
    size: Shard['size'],
    hash: Shard['hash'],
    url: string
  }[]> {  
    const bucketEntryShards = await this.bucketEntryShardsRepository.findByBucketEntrySortedByIndex(bucketEntryId);
    const shards = await this.shardsRepository.findByIds(bucketEntryShards.map(b => b.shard));
    const mirrors = await this.mirrorsRepository.findByShardHashesWithContacts(shards.map(s => s.hash));

    const response: {
      index: BucketEntryShard['index'],
      size: Shard['size'],
      hash: Shard['hash'],
      url: string
    }[] = [];

    for (const { contact, shardHash } of mirrors) {
      const { address, port } = contact;

      const shard = shards.find(s => s.hash === shardHash) as Shard;
      const bucketEntryShard = bucketEntryShards.find(
        b => b.shard.toString() === shard.id.toString()
      ) as BucketEntryShard;
      const farmerUrl = `http://${address}:${port}/v2/download/link/${shard.uuid}`;

      await axios.get(farmerUrl).then(res => {
        response.push({
          index: bucketEntryShard.index,
          size: shard.size,
          hash: shard.hash,
          url: res.data.result,
        });
      });
    }

    return response;
  }

}
