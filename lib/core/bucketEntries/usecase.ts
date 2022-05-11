import { BucketsRepository } from '../buckets/Repository';
import { BucketEntriesRepository } from './Repository';
import { BucketNotFoundError, BucketForbiddenError, BucketEntryNotFoundError, BucketEntryFrameNotFoundError } from '../buckets/usecase';
import { FramesRepository } from '../frames/Repository';
import { ShardsUsecase } from '../shards/usecase';
import { BucketEntryShardsRepository } from '../bucketEntryShards/Repository';
import { ShardsRepository } from '../shards/Repository';
import { PointersRepository } from '../pointers/Repository';

export class BucketEntryVersionNotFoundError extends Error {
  constructor() {
    super('BucketEntryVersion not found');

    Object.setPrototypeOf(this, BucketEntryVersionNotFoundError.prototype);
  }
}

export class BucketEntriesUsecase {
  constructor(
    private bucketEntriesRepository: BucketEntriesRepository,
    private bucketsRepository: BucketsRepository,
    private framesRepository: FramesRepository,
    private bucketEntryShards: BucketEntryShardsRepository,
    private shardsRepository: ShardsRepository,
    private pointersRepository: PointersRepository,
    private shardsUsecase: ShardsUsecase,
  ) { }

  async removeFileFromUser(bucketId: string, fileId: string, userId: string) {
    const bucket = await this.bucketsRepository.findOne({ id: bucketId });

    if(!bucket) {
      throw new BucketNotFoundError();
    }

    if (bucket.user !== userId) {
      throw new BucketForbiddenError();
    }

    return this.removeFile(fileId);
  }

  async removeFileAndValidateBucketExists(bucketId: string, fileId: string) {
    const bucket = await this.bucketsRepository.findOne({ id: bucketId });
    
    if(!bucket) {
      throw new BucketNotFoundError();
    }

    return this.removeFile(fileId);
  }

  removeFile = async (fileId: string): Promise<void> => {
    const bucketEntry = await this.bucketEntriesRepository.findOne({ id: fileId });

    if (!bucketEntry) {
      throw new BucketEntryNotFoundError();
    }

    const version = bucketEntry.version;

    let shardIds: string[];

    if (version === 1) {
      const frame = await this.framesRepository.findOne({ bucketEntry: bucketEntry.id });

      if (!frame) {
        console.error('Frame not found for file %s', bucketEntry.id);

        return this.bucketEntriesRepository.deleteByIds([bucketEntry.id]);
      }

      shardIds = frame.shards;

      await this.framesRepository.deleteByIds([frame.id]);
      await this.pointersRepository.deleteByIds(shardIds);

    } else if (version === 2 ) {
      const bucketEntryShards = await this.bucketEntryShards.findByBucketEntry(bucketEntry.id);
      shardIds = bucketEntryShards.map(bucketEntryShards => bucketEntryShards.shard);
    } else {

      throw new BucketEntryVersionNotFoundError();
    }

    const shards = await this.shardsRepository.findByIds(shardIds);
    const shardHashes = shards.map(shard => shard.hash);
    await this.shardsUsecase.enqueueDeleteShardMessages(shardHashes, version);
    await this.bucketEntriesRepository.deleteByIds([bucketEntry.id]);
  }
}