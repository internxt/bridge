import { ObjectId } from 'mongodb';
import { BucketEntryShard } from '../../../../lib/core/bucketEntryShards/BucketEntryShard';
import { bucketentries } from './bucketentries.fixtures';
import { shards } from './shards.fixtures';

type MongoBucketEntryShards = Required<
  Omit<BucketEntryShard, 'id' | 'bucketEntry' | 'shard'>
> & {
  _id: ObjectId;
  bucketEntry: ObjectId;
  shard: ObjectId;
};

const formatBucketEntryShards = ({
  _id,
  ...model
}: MongoBucketEntryShards): BucketEntryShard => ({
  ...model,
  id: _id.toString(),
  bucketEntry: model.bucketEntry.toString(),
  shard: model.shard.toString(),
});

const userOneBucketEntryShards: MongoBucketEntryShards[] = [
  {
    _id: new ObjectId('628cedd1daeda9001f828b10'),
    bucketEntry: bucketentries[0]._id,
    shard: shards[0]._id,
    index: 2,
  },
  {
    _id: new ObjectId('728cedd1daeda9001f828b10'),
    bucketEntry: bucketentries[0]._id,
    shard: shards[1]._id,
    index: 1,
  },
  {
    _id: new ObjectId('828cedd1daeda9001f828b10'),
    bucketEntry: bucketentries[0]._id,
    shard: shards[2]._id,
    index: 0,
  },
  {
    _id: new ObjectId('828cedd1daeda9001f828b12'),
    bucketEntry: bucketentries[1]._id,
    shard: shards[2]._id,
    index: 0,
  },
];

export const bucketentryshards: MongoBucketEntryShards[] =
  userOneBucketEntryShards;

export const bucketEntryShardFixtures: BucketEntryShard[] =
  userOneBucketEntryShards.map(formatBucketEntryShards);
