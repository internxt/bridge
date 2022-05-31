import { Frame } from '../frames/Frame';
import { BucketEntry, BucketEntryWithFrame } from './BucketEntry';
import { BucketEntriesRepository } from './Repository';

interface BucketEntryModel extends Omit<BucketEntry, 'id'> {
  _id: string;
  created: Date;
  renewal: Date;
  toObject(): Omit<BucketEntryModel, 'toObject'>;
}

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

    const plainObj: BucketEntry = {
      ...bucketEntry.toObject(),
      id: bucketEntry._id.toString(),
      bucket: bucketEntry.bucket.toString(),
    };

    return plainObj;
  }

  async findByIds(ids: string[]): Promise<BucketEntry[]> {
    const bucketEntries = await this.model.find({ _id: { $in: ids } });

    return bucketEntries.map((b: any) => b.toObject());
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
      result = {
        ...bucketEntry.toObject(),
        id: bucketEntry._id.toString(),
        bucket: bucketEntry.bucket.toString(),
        frame: bucketEntry.frame,
      };
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

    return bucketEntriesModels.map((be) => ({
      ...be.toObject(),
      id: be.id.toString(),
      bucket: be.bucket.toString(),
    }));
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
