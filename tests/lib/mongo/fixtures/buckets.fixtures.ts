import { Bucket } from '../../../../lib/core/buckets/Bucket';
import { ObjectId } from 'mongodb';
import { users } from './users.fixtures';

type MongoBucketModel = Required<Omit<Bucket, 'id'>> & {
  _id: ObjectId;
};

const formatBucket = ({ _id, ...model }: MongoBucketModel): Bucket => ({
  ...model,
  id: _id.toString(),
});

const userOneBuckets: MongoBucketModel[] = [
  {
    _id: new ObjectId('72b814bf3cde6dcc6f6c9a7b'),
    user: users[0]._id,
    encryptionKey: '',
    userId: users[0].uuid,
    name: 'Bucket-914bfa',
    status: 'Active',
    transfer: 0,
    storage: 0,
    created: new Date('2020-01-01T00:00:00.000Z'),
    maxFrameSize: -1,
    publicPermissions: [],
    pubkeys: [],
  },
  {
    _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaac'),
    user: users[0]._id,
    userId: users[0].uuid,
    encryptionKey: '',
    name: 'Bucket-914bfb',
    status: 'Active',
    transfer: 0,
    storage: 0,
    created: new Date('2020-01-01T00:00:00.000Z'),
    maxFrameSize: -1,
    publicPermissions: [],
    pubkeys: [],
  },
];

export const buckets: MongoBucketModel[] = userOneBuckets;

export const bucketsFixtures: Bucket[] = userOneBuckets.map(formatBucket);
