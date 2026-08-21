import lodash from 'lodash';

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
import { UserNotFoundError, UserSpaceSnapshot } from '../users';
import { User } from '../users/User';
import { Bucket } from '../buckets/Bucket';
import { FileStateRepository } from '../fileState/Repository';

/**
 * Raised when a bucket turns out to hold entries backed by shards.
 *
 * Dropping those entries wholesale would strand their shards, mirrors and the
 * bytes on the farmers with nothing left pointing at them.
 */
export class ShardBackedBucketError extends Error {
  constructor() {
    super('Bucket holds shard-backed entries and cannot be purged by this route');

    Object.setPrototypeOf(this, ShardBackedBucketError.prototype);
  }
}

const isShardBackedEntry = (entry: BucketEntry): boolean =>
  Boolean(entry.frame) || Boolean(entry.index) || Boolean(entry.hmac);

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
    private usersRepository: UsersRepository,
    private fileStateRepository: FileStateRepository
  ) { }

  async listByBucket(bucketId: Bucket['id'], limit = 20, offset = 0): Promise<BucketEntry[]> {
    const bucketEntries = await this.bucketEntriesRepository.findByBucket(bucketId, limit, offset);

    return bucketEntries;
  }

  async findById(id: BucketEntry['id']): Promise<BucketEntry | null> {
    const bucketEntry = await this.bucketEntriesRepository.findOne({ id });

    return bucketEntry;
  }

  async countByBucket(bucketId: Bucket['id']): Promise<number> {
    const count = await this.bucketEntriesRepository.count({ bucket: bucketId });

    return count;
  }

  async removeFileFromUser(bucketId: string, fileId: string, userId: User['uuid']) {
    const bucket = await this.bucketsRepository.findOne({ id: bucketId });

    if (!bucket) {
      throw new BucketNotFoundError();
    }

    if (bucket.userId !== userId) {
      throw new BucketForbiddenError();
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
      await this.removeFilesV1([bucketEntry]);
    } else if (version === 2) {
      await this.removeFilesV2([bucketEntry]);
      const bucket = await this.bucketsRepository.findOne({ id: bucketEntry.bucket });

      if (bucket?.userId) {
        const user = await this.usersRepository.findByUuid(bucket.userId);

        if (user) {
          await this.usersRepository.addTotalUsedSpaceBytes(user.uuid, - bucketEntry.size!);
        }
      }
    } else {
      throw new BucketEntryVersionNotFoundError();
    }
  }

  async removeFiles(fileIds: string[]) {
    const bucketEntries = await this.bucketEntriesRepository.findByIds(fileIds);
    const bucketEntriesV2 = bucketEntries.filter(b => b.version && b.version === 2);
    const bucketEntriesV1 = bucketEntries.filter(b => !b.version || b.version === 1);

    if (bucketEntriesV1.length > 0) {
      await this.removeFilesV1(bucketEntriesV1);
    }

    if (bucketEntriesV2.length > 0) {
      await this.removeFilesV2(bucketEntriesV2);

      const bucketEntriesGroupedByBucket = lodash.groupBy(bucketEntriesV2, (b) => b.bucket);
      const buckets = await this.bucketsRepository.findByIds(Object.keys(bucketEntriesGroupedByBucket));

      const bucketsGroupedByUsers = lodash.groupBy(buckets, (b) => b.userId);
      const storageToModifyPerUser: Record<User['uuid'], number> = {};

      Object.keys(bucketsGroupedByUsers).forEach((userId) => {
        storageToModifyPerUser[userId] = 0;
      });

      Object.keys(bucketsGroupedByUsers).forEach((userId) => {
        const buckets = bucketsGroupedByUsers[userId];

        for (const bucket of buckets) {
          const userBucketEntries = bucketEntriesGroupedByBucket[bucket.id.toString()];
          storageToModifyPerUser[userId] += userBucketEntries.reduce((acumm, b) => b.size! + acumm, 0);
        }
      });

      for (const user in storageToModifyPerUser) {
        const storageToSubstract = -storageToModifyPerUser[user];

        await this.usersRepository.addTotalUsedSpaceBytes(user, storageToSubstract);
      }
    }

    return fileIds;
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

  async removeFilesV2(files: BucketEntry[]): Promise<void> {
    const fileIds = files.map(f => f.id);
    const bucketEntryShards = await this.bucketEntryShardsRepository.findByBucketEntries(fileIds);
    const bucketEntryShardsIds = bucketEntryShards.map(b => b.id);
    const shardIds = bucketEntryShards.map(b => b.shard);
    const shards = await this.shardsRepository.findByIds(shardIds);

    if (shards.length > 0) {
      await this.shardsUsecase.deleteShardsStorageByUuids(shards as any);
      await this.shardsRepository.deleteByIds(shards.map(s => s.id));
    }

    if (bucketEntryShardsIds.length > 0) {
      await this.bucketEntryShardsRepository.deleteByIds(bucketEntryShardsIds);
    }

    await this.fileStateRepository.deleteByBucketEntryIds(fileIds);
    await this.bucketEntriesRepository.deleteByIds(fileIds);
  }

  private async findBucketOwner(
    userUuid: User['uuid'],
    bucketId: Bucket['id']
  ): Promise<User> {
    const user = await this.usersRepository.findByUuid(userUuid);

    if (!user) {
      throw new UserNotFoundError(userUuid);
    }

    const bucket = await this.bucketsRepository.findOne({ id: bucketId, userId: userUuid });

    if (!bucket) {
      throw new BucketNotFoundError();
    }

    return user;
  }

  async createEntry(
    userUuid: User['uuid'],
    bucketId: Bucket['id'],
    size: number
  ): Promise<{ id: BucketEntry['id']; snapshot: UserSpaceSnapshot }> {
    const user = await this.findBucketOwner(userUuid, bucketId);

    const entry = await this.bucketEntriesRepository.create({
      bucket: bucketId,
      size,
      version: 2,
    });

    const totalUsedSpaceBytes = await this.usersRepository.addTotalUsedSpaceBytes(userUuid, size);

    return {
      id: entry.id,
      snapshot: {
        maxSpaceBytes: user.maxSpaceBytes,
        totalUsedSpaceBytes,
      },
    };
  }

  async removeEntry(
    userUuid: User['uuid'],
    bucketId: Bucket['id'],
    entryId: BucketEntry['id']
  ): Promise<UserSpaceSnapshot> {
    const user = await this.findBucketOwner(userUuid, bucketId);

    const entry = await this.bucketEntriesRepository.findOne({ id: entryId, bucket: bucketId });

    if (!entry) {
      return {
        maxSpaceBytes: user.maxSpaceBytes,
        totalUsedSpaceBytes: user.totalUsedSpaceBytes,
      };
    }

    await this.removeFilesV2([entry]);

    const totalUsedSpaceBytes = await this.usersRepository.addTotalUsedSpaceBytes(
      userUuid,
      -(entry.size || 0)
    );

    return {
      maxSpaceBytes: user.maxSpaceBytes,
      totalUsedSpaceBytes,
    };
  }

  /**
   * Removes a bucket and every entry in it.
   *
   * The entries this purges are metadata only: createEntry() writes a row with
   * a bucket, a size and a version, and nothing else. Nothing downstream of a
   * bucket entry exists for them, which is what makes a wholesale delete
   * possible instead of walking each entry and its shards. Anything else in
   * the bucket is refused, see ShardBackedBucketError.
   */
  async removeBucketAndEntries(
    userUuid: User['uuid'],
    bucketId: Bucket['id']
  ): Promise<UserSpaceSnapshot> {
    const [user, bucket, sample] = await Promise.all([
      this.usersRepository.findByUuid(userUuid),
      this.bucketsRepository.findOne({ id: bucketId }),
      this.bucketEntriesRepository.findOne({ bucket: bucketId }),
    ]);

    if (!user) {
      throw new UserNotFoundError(userUuid);
    }

    if (bucket && bucket.userId !== userUuid) {
      throw new BucketForbiddenError();
    }

    if (sample && isShardBackedEntry(sample)) {
      throw new ShardBackedBucketError();
    }

    await this.bucketsRepository.removeByIdAndUser(bucketId, userUuid);

    const releasedBytes = await this.bucketEntriesRepository.sumSizeByBucket(bucketId);

    await this.bucketEntriesRepository.deleteByBucket(bucketId);

    const totalUsedSpaceBytes = releasedBytes === 0
      ? user.totalUsedSpaceBytes
      : await this.usersRepository.addTotalUsedSpaceBytes(userUuid, -releasedBytes);

    return {
      maxSpaceBytes: user.maxSpaceBytes,
      totalUsedSpaceBytes,
    };
  }
}
