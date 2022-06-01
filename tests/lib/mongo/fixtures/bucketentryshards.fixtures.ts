import { ObjectId } from 'mongodb';
import { BucketEntryShard } from '../../../../lib/core/bucketEntryShards/BucketEntryShard';

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
    bucketEntry: new ObjectId('628cedd1daeda9001f828b0d'),
    shard: new ObjectId('628d0178daeda9001f828b13'),
    index: 2,
  },
  {
    _id: new ObjectId('728cedd1daeda9001f828b10'),
    bucketEntry: new ObjectId('628cedd1daeda9001f828b0d'),
    shard: new ObjectId('728d0178daeda9001f828b13'),
    index: 1,
  },
  {
    _id: new ObjectId('828cedd1daeda9001f828b10'),
    bucketEntry: new ObjectId('628cedd1daeda9001f828b0d'),
    shard: new ObjectId('828d0178daeda9001f828b13'),
    index: 0,
  },
  {
    _id: new ObjectId('828cedd1daeda9001f828b12'),
    bucketEntry: new ObjectId('628cedd1daeda9001f828b0f'),
    shard: new ObjectId('828d0178daeda9001f828b13'),
    index: 0,
  },
];

export const bucketentryshards: MongoBucketEntryShards[] =
  userOneBucketEntryShards;

export const bucketEntryShardFixtures: BucketEntryShard[] =
  userOneBucketEntryShards.map(formatBucketEntryShards);
