import { BucketEntry } from "../bucketEntries/BucketEntry";
import { Shard } from "../shards/Shard";

export interface BucketEntryShard {
  bucketEntry: BucketEntry['id'];
  shard: Shard['id'];
  index: number;
}
