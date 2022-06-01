import { BucketEntry } from '../bucketEntries/BucketEntry';
import { Shard } from '../shards/Shard';

export interface BucketEntryShard {
  id: string;
  bucketEntry: BucketEntry['id'];
  shard: Shard['id'];
  index: number;
}
