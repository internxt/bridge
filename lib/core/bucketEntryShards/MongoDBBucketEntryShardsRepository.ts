import { BucketEntry } from '../bucketEntries/BucketEntry';
import { BucketEntryShard } from './BucketEntryShard';
import { BucketEntryShardsRepository } from './Repository';

const formatFromMongoToBucketEntryShard = (
  mongoBucketEntryShard: any
): BucketEntryShard => {
  const id = mongoBucketEntryShard._id.toString();
  const bucketEntryShard = mongoBucketEntryShard.toObject();
  delete bucketEntryShard._id;
  return {
    ...bucketEntryShard,
    id: id,
    bucketEntry: mongoBucketEntryShard.bucketEntry.toString(),
    shard: mongoBucketEntryShard.shard.toString(),
  };
};
export class MongoDBBucketEntryShardsRepository
  implements BucketEntryShardsRepository {
  constructor(private model: any) { }

  async find(where: Partial<BucketEntryShard>): Promise<BucketEntryShard[]> {
    const results = await this.model.find(where);
    return results.map(formatFromMongoToBucketEntryShard);
  }

  async findByBucketEntry(
    bucketEntryId: BucketEntry['id']
  ): Promise<BucketEntryShard[] & { sort: (...x: any) => any }> {
    const results = await this.model.find({ bucketEntry: bucketEntryId });

    return results.map(formatFromMongoToBucketEntryShard);
  }

  async findByBucketEntries(
    bucketEntries: string[]
  ): Promise<BucketEntryShard[]> {
    const bucketEntryShards = await this.model.find({
      bucketEntry: { $in: bucketEntries },
    });

    return bucketEntryShards.map(formatFromMongoToBucketEntryShard);
  }

  findByBucketEntrySortedByIndex(
    bucketEntryId: BucketEntry['id']
  ): Promise<BucketEntryShard[]> {
    return this.model
      .find({ bucketEntry: bucketEntryId })
      .sort({ index: 1 })
      .exec()
      .then((res: any) => {
        return res.map(formatFromMongoToBucketEntryShard);
      });
  }

  async create(data: Omit<BucketEntryShard, 'id'>): Promise<BucketEntryShard> {
    const rawModel = await new this.model(data).save();
    return formatFromMongoToBucketEntryShard(rawModel);
  }

  deleteByIds(ids: string[]): Promise<void> {
    return this.model.deleteMany({ _id: { $in: ids } }).exec();
  }

  async insertMany(data: Omit<BucketEntryShard, 'id'>[]): Promise<void> {
    await this.model.insertMany(data);
  }
}
