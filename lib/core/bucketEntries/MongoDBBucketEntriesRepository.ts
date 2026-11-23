import { Frame } from '../frames/Frame';
import { BucketEntry, BucketEntryWithFrame } from './BucketEntry';
import { BucketEntriesRepository } from './Repository';
import { ObjectId } from 'mongodb';

/**
 * The fields that mark an entry as backed by storage: `frame` on v1 entries,
 * `index` and `hmac` on v2 uploads. Gateway entries (createEntry) set none of
 * them, which is what makes them safe to drop wholesale.
 */
const SHARD_MARKERS = ['frame', 'index', 'hmac.value'];

const METADATA_ONLY = {
  $and: SHARD_MARKERS.map((field) => ({ [field]: { $exists: false } })),
};

const SHARD_BACKED = {
  $or: SHARD_MARKERS.map((field) => ({ [field]: { $exists: true } })),
};

interface BucketEntryModel extends Omit<BucketEntry, 'id'> {
  _id: string;
  created: Date;
  renewal: Date;
  toObject(): Omit<BucketEntryModel, 'toObject'>;
}

export const formatFromMongoToBucketEntry = (
  mongoBucketEntry: any
): BucketEntry => {
  const id = mongoBucketEntry._id.toString();
  const bucketEntry = mongoBucketEntry.toObject();
  delete bucketEntry._id;
  if (bucketEntry.frame) {
    bucketEntry.frame = bucketEntry.frame.toString();
  }
  return {
    ...bucketEntry,
    id,
    bucket: bucketEntry.bucket.toString(),
  };
};

const formatFromMongoToFrameLocally = (mongoFrame: any) => {
  const id = mongoFrame.id.toString();
  const shards = mongoFrame.shards.map((shardId: ObjectId) =>
    shardId.toString()
  );
  return {
    ...mongoFrame,
    id,
    shards,
  };
};

export const formatFromMongoToBucketEntryWithFrame = (
  mongoBucketEntry: any
): BucketEntryWithFrame => {
  const id = mongoBucketEntry._id.toString();
  const bucketEntry = mongoBucketEntry.toObject();
  delete bucketEntry._id;
  if (bucketEntry.frame) {
    bucketEntry.frame = formatFromMongoToFrameLocally(bucketEntry.frame);
  }
  return {
    ...bucketEntry,
    id,
    bucket: bucketEntry.bucket.toString(),
  };
};

export class MongoDBBucketEntriesRepository implements BucketEntriesRepository {
  constructor(private model: any) {}

  count(where: Partial<BucketEntry>): Promise<number> {
    return this.model.countDocuments(where);
  }

  async findOne(where: Partial<BucketEntry>): Promise<BucketEntry | null> {
    let query: Partial<BucketEntry> & { _id?: string } = where;

    if (where.id) {
      query = { ...query, _id: where.id };
      delete query.id;
    }

    const bucketEntry: BucketEntryModel | null = await this.model.findOne(
      query
    );

    if (!bucketEntry) {
      return null;
    }

    return formatFromMongoToBucketEntry(bucketEntry);
  }

  async findByBucket(
    bucketId: string,
    limit = 20,
    skip = 0
  ): Promise<BucketEntry[]> {
    const bucketEntries = await this.model.find({ bucket: bucketId }).skip(skip).limit(limit).exec();

    return bucketEntries.map(formatFromMongoToBucketEntry);
  }

  async hasEntriesByBucket(bucketId: string): Promise<boolean> {
    const found = await this.model
      .countDocuments({ bucket: bucketId }, { limit: 1 })
      .read('primary')
      .exec();

    return found > 0;
  }

  async hasShardBackedEntriesByBucket(bucketId: string): Promise<boolean> {
    const found = await this.model
      .countDocuments({ bucket: bucketId, ...SHARD_BACKED }, { limit: 1 })
      .read('primary')
      .exec();

    return found > 0;
  }

  async sumMetadataOnlyBytesByBucket(bucketId: string): Promise<number> {
    const [result] = await this.model
      .aggregate([
        { $match: { bucket: new ObjectId(bucketId), ...METADATA_ONLY } },
        { $group: { _id: null, bytes: { $sum: '$size' } } },
      ])
      .read('primary')
      .exec();

    return result?.bytes ?? 0;
  }

  async deleteMetadataOnlyByBucket(bucketId: string): Promise<void> {
    await this.model.deleteMany({ bucket: bucketId, ...METADATA_ONLY });
  }

  async findByIds(ids: string[]): Promise<BucketEntry[]> {
    const bucketEntries = await this.model.find({ _id: { $in: ids } });

    return bucketEntries.map(formatFromMongoToBucketEntry);
  }

  async findOneWithFrame(
    where: Partial<BucketEntry>
  ): Promise<(Omit<BucketEntryWithFrame, 'frame'> & { frame?: Frame }) | null> {
    let query: Partial<BucketEntry> & { _id?: string } = where;

    if (where.id) {
      query = { ...query, _id: where.id };
      delete query.id;
    }

    const bucketEntry:
      | (Omit<BucketEntryModel, 'frame'> & { frame?: Frame })
      | null = await this.model.findOne(query).populate('frame').exec();

    let result:
      | (Omit<BucketEntryWithFrame, 'frame'> & { frame?: Frame })
      | null = null;

    if (bucketEntry) {
      return formatFromMongoToBucketEntryWithFrame(bucketEntry);
    }

    return result;
  }

  async findByIdsWithFrames(
    ids: BucketEntry['id'][]
  ): Promise<(Omit<BucketEntryWithFrame, 'frame'> & { frame?: Frame })[]> {
    const bucketEntriesModels: any[] = await this.model
      .find({ _id: { $in: ids } })
      .populate('frame')
      .exec();

    return bucketEntriesModels.map(formatFromMongoToBucketEntryWithFrame);
  }

  async create(data: Omit<BucketEntry, 'id'>): Promise<BucketEntry> {
    const rawModel = await new this.model({
      ...data,
      created: new Date(),
    }).save();

    return rawModel.toObject();
  }

  async deleteByIds(ids: BucketEntry['id'][]): Promise<void> {
    await this.model.deleteMany({ _id: { $in: ids } });
  }
}
