import { BucketEntry } from '../../../../lib/core/bucketEntries/BucketEntry';
import { ObjectId } from 'mongodb';
import { frames } from './frames.fixtures';
import { buckets } from './buckets.fixtures';

type MongoBucketEntriesModel = Required<
  Omit<BucketEntry, 'id' | 'bucket' | 'frame' | 'filename'>
> & {
  _id: ObjectId;
  bucket: ObjectId;
  name: string;
  frame?: ObjectId;
};

const formatBuckeEntries = ({
  _id,
  name,
  frame,
  ...model
}: MongoBucketEntriesModel): BucketEntry => {
  const be: BucketEntry = {
    ...model,
    id: _id.toString(),
    bucket: model.bucket.toString(),
    filename: name,
  };
  if (frame) {
    be.frame = frame.toString();
  }
  return be;
};

const userOneBucketEntries: MongoBucketEntriesModel[] = [
  {
    _id: new ObjectId('628cedd1daeda9001f828b0d'),
    name: '243aa853-1d9f-49f5-95f6-787137aaabbb',
    bucket: buckets[0]._id,
    index: '4433b4bc2264aa93e2c5dc5098a6ef54a68fcea4c5a3961bb40686893cb73b81',
    size: 7298260,
    version: 2,
    created: new Date('2022-05-24T14:38:09.150Z'),
    renewal: new Date('2022-08-22T14:38:09.200Z'),
    mimetype: 'application/octet-stream',
  },
  {
    _id: new ObjectId('72b814bf3cde6dcc6f6c9a7c'),
    name: '666aa853-1d9f-49f5-95f6-787137ffffff',
    bucket: buckets[0]._id,
    index: '4433b4bc2264aa93e2c5dc5098a6ef54a68fcea4c5a3961bb40686893cb73b82',
    size: 9298260,
    version: 2,
    created: new Date('2022-05-24T14:38:09.150Z'),
    renewal: new Date('2022-08-22T14:38:09.200Z'),
    mimetype: 'application/octet-stream',
  },
  {
    _id: new ObjectId('72b814bf3cde6dcc6f6c9a7f'),
    name: '666aa853-1d9f-49f5-95f6-787137fffffc',
    frame: frames[0]._id,
    bucket: buckets[0]._id,
    index: '3433b4bc2264aa93e2c5dc5098a6ef54a68fcea4c5a3961bb40686893cb73b80',
    size: 9298269,
    version: 1,
    created: new Date('2022-05-24T14:38:09.150Z'),
    renewal: new Date('2022-08-22T14:38:09.200Z'),
    mimetype: 'application/octet-stream',
  },
];

export const bucketentries: MongoBucketEntriesModel[] = userOneBucketEntries;
export const bucketEntryFixtures: BucketEntry[] =
  userOneBucketEntries.map(formatBuckeEntries);
