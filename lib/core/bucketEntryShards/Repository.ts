import { BucketEntry } from "../bucketEntries/BucketEntry";
import { BucketEntryShard } from "./BucketEntryShard";

export interface BucketEntryShardsRepository {
  findByBucketEntry(bucketEntry: BucketEntry['id']): Promise<BucketEntryShard[]>;
  findByBucketEntrySortedByIndex(bucketEntry: BucketEntry['id']): Promise<BucketEntryShard[]>;
  create(data: Omit<BucketEntryShard, 'id'>): Promise<BucketEntryShard>
  insertMany(data: Omit<BucketEntryShard, 'id'>[]): Promise<void>;
}
