import { BucketsRepository } from '../buckets/Repository';
import { BucketEntriesRepository } from './Repository';
import { BucketNotFoundError, BucketForbiddenError, BucketEntryNotFoundError, BucketEntryFrameNotFoundError } from '../buckets/usecase';
import { FramesRepository } from '../frames/Repository';
import { ShardsUsecase } from '../shards/usecase';

export class BucketEntriesUsecase {
  constructor(
    private bucketEntriesRepository: BucketEntriesRepository,
    private bucketsRepository: BucketsRepository,
    private framesRepository: FramesRepository,
    private shardsUsecase: ShardsUsecase,
  ) { }

  async removeFile(bucketId: string, userId: string, fileId: string): Promise<void> {
    const bucket = await this.bucketsRepository.findOne({ id: bucketId });

    if(!bucket) {
      throw new BucketNotFoundError();
    }

    if (bucket.user !== userId) {
      throw new BucketForbiddenError();
    }

    const bucketEntry = await this.bucketEntriesRepository.findOneWithFrame({ id: fileId });

    if (!bucketEntry) {
      throw new BucketEntryNotFoundError();
    }

    if (!bucketEntry.frame) {
      throw new BucketEntryFrameNotFoundError();
    }

    const frame = await this.framesRepository.findOne({ id: bucketEntry.frame.id });

    if (!frame) {
      console.error('Frame %s not found for file %s', bucketEntry.frame.id, bucketEntry.id);

      return this.bucketEntriesRepository.deleteByIds([bucketEntry.id]);
    }

    const version = bucketEntry.version || 1;

    await this.shardsUsecase.deleteShardsByIds(frame.shards, {
      beforePointerIsDeleted: this.shardsUsecase.enqueueDeleteShardMessage,
      version,
    });
    
    await this.framesRepository.deleteByIds([frame.id]);
    await this.bucketEntriesRepository.deleteByIds([bucketEntry.id]);
  }
}