import { Frame } from '../frames/Frame';
import { BucketEntry, BucketEntryWithFrame } from './BucketEntry';
import { BucketEntriesRepository } from './Repository';
import { ObjectId } from 'mongodb';

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
  ): Promise<
    (Omit<BucketEntryWithFrame, 'frame'> & { frame?: Frame | undefined })[]
  > {
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
