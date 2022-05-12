import { BucketEntry } from "../bucketEntries/BucketEntry";
import { BucketEntryShard } from "./BucketEntryShard";
import { BucketEntryShardsRepository } from "./Repository";

export class MongoDBBucketEntryShardsRepository implements BucketEntryShardsRepository {
  constructor(private model: any) {}
  
  find(where: Partial<BucketEntryShard>): Promise<BucketEntryShard[]> {
    return this.model.find(where);
  }

  findByBucketEntry(bucketEntryId: BucketEntry['id']): Promise<BucketEntryShard[] & { sort: (...x: any) => any; }> {
    return this.model.find({ bucketEntry: bucketEntryId });
  }

  findByBucketEntrySortedByIndex(bucketEntryId: BucketEntry['id']): Promise<BucketEntryShard[]> {
    return this.model.find({ bucketEntry: bucketEntryId }).sort({ index: 1 }).exec().then((res: any) => {
      return res.map((r: any) => {
        return {
          id: r._id,
          ...r.toObject()
        }
      });
    });
  }

  async create(data: Omit<BucketEntryShard, "id">): Promise<BucketEntryShard> {
    const rawModel = await new this.model(data).save();  
    const plainObj = rawModel.toObject();

    return { id: plainObj._id, ...plainObj };
  }

  async insertMany(data: Omit<BucketEntryShard, "id">[]): Promise<void> {
    await this.model.insertMany(data);
  }
}