import { ObjectId } from 'mongodb';
import { Mirror } from '../../../../lib/core/mirrors/Mirror';
import { shards as shardDocuments } from './shards.fixtures';
import { contacts as contactDocuments } from './contacts.fixtures';

type MongoMirrorModel = Required<Omit<Mirror, 'id'>> & {
  _id: ObjectId;
};

const formatMirror = ({ _id, ...model }: MongoMirrorModel): Mirror => ({
  ...model,
  id: _id.toString(),
});

const mirrorsTest: MongoMirrorModel[] = [
  {
    _id: new ObjectId('628d0178daeda9001f828b14'),
    shardHash: shardDocuments[0].hash,
    contact: contactDocuments[0]._id,
    contract: {
      data_hash: 'c84794b3f43a457c645fd3e5963ed9a49f5fe382',
      store_begin: new Date('2022-05-24T16:01:58.717Z'),
      data_size: 7298260,
      farmer_id: '9a1c78a507689f6f54b847ad1cef1e614ee23f1e',
      version: 1,
    },
    token: '',
    isEstablished: true,
    created: new Date('2022-05-24T16:02:00.463Z'),
  },
  {
    _id: new ObjectId('728d0178daeda9001f828b14'),
    shardHash: shardDocuments[1].hash,
    contact: contactDocuments[1]._id,
    contract: {
      data_hash: 'b84794b3f43a457c645fd3e5963ed9a49f5fe382',
      store_begin: new Date('2022-05-24T16:01:58.717Z'),
      data_size: 8298260,
      farmer_id: '9a1c78a507689f6f54b847ad1cef1e614ee23f1e',
      version: 1,
    },
    token: '',
    isEstablished: true,
    created: new Date('2022-05-24T16:02:00.463Z'),
  },
];

export const mirrors: MongoMirrorModel[] = mirrorsTest;
export const mirrorsFixtures: Mirror[] = mirrorsTest.map(formatMirror);
