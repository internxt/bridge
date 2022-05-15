import { BucketsRepository } from '../buckets/Repository';
import { BucketEntriesRepository } from './Repository';
import { BucketNotFoundError, BucketForbiddenError, BucketEntryNotFoundError } from '../buckets/usecase';
import { FramesRepository } from '../frames/Repository';
import { ShardsUsecase } from '../shards/usecase';
import { BucketEntryShardsRepository } from '../bucketEntryShards/Repository';
import { ShardsRepository } from '../shards/Repository';
import { PointersRepository } from '../pointers/Repository';
import { MirrorsRepository } from '../mirrors/Repository';
import { BucketEntry } from './BucketEntry';
import { UsersRepository } from '../users/Repository';

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
    private bucketEntryShardsRepository: BucketEntryShardsRepository,
    private shardsRepository: ShardsRepository,
    private pointersRepository: PointersRepository,
    private mirrorsRepository: MirrorsRepository,
    private shardsUsecase: ShardsUsecase,
    private usersRepository: UsersRepository
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

  async removeFile(fileId: string): Promise<void> {
    const bucketEntry = await this.bucketEntriesRepository.findOne({ id: fileId });

    if (!bucketEntry) {
      throw new BucketEntryNotFoundError();
    }

    const version = bucketEntry.version;

    if (!version || version === 1) {
      await this.removeFilesV1([ bucketEntry ]);
    } else if (version === 2) {
      await this.removeFilesV2([ bucketEntry ]);
      const bucket = await this.bucketsRepository.findOne({ id: bucketEntry.bucket });

      if (bucket?.user) {
        const user = await this.usersRepository.findById(bucket.user);

        if (user) {
          await this.usersRepository.addTotalUsedSpaceBytes(bucket.user, - bucketEntry.size!);
        }
      }
    } else {
      throw new BucketEntryVersionNotFoundError();
    }
  }

  async removeFilesV1(files: BucketEntry[]) {
    const frameIds = files.map((f) => f.frame as string);
    const frames = await this.framesRepository.findByIds(frameIds);

    const pointerIds = frames.flatMap(f => f.shards);
    const pointers = await this.pointersRepository.findByIds(pointerIds);

    const shardsHashes = pointers.map(p => p.hash);

    if (shardsHashes.length > 0) {
      await this.shardsUsecase.deleteShardsStorageByHashes(shardsHashes);
      await this.shardsRepository.deleteByHashes(shardsHashes);  
    }

    if (pointerIds.length > 0) {
      await this.pointersRepository.deleteByIds(pointerIds);
    }

    if (frames.length > 0) {
      await this.framesRepository.deleteByIds(frames.map(f => f.id));
    }
    
    await this.bucketEntriesRepository.deleteByIds(files.map(f => f.id));
  }

  async removeFilesV2(files: BucketEntry[]) {
    const fileIds = files.map(f => f.id);
    const bucketEntryShards = await this.bucketEntryShardsRepository.findByBucketEntries(fileIds);
    const bucketEntryShardsIds = bucketEntryShards.map(b => b.id);
    const shardIds = bucketEntryShards.map(b => b.shard);
    const shards = await this.shardsRepository.findByIds(shardIds);

    if (shards.length > 0) {
      await this.shardsUsecase.deleteShardsStorageByUuids(shards.map(s => ({ uuid: s.uuid!, hash: s.hash })));
      await this.shardsRepository.deleteByIds(shards.map(s => s.id));   
    }

    if (bucketEntryShardsIds.length > 0) {
      await this.bucketEntryShardsRepository.deleteByIds(bucketEntryShardsIds);
    }
    
    await this.bucketEntriesRepository.deleteByIds(fileIds);
  }
}