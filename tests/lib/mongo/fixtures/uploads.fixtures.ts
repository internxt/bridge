import { ObjectId } from 'mongodb';
import { Upload } from '../../../../lib/core/uploads/Upload';
import { shards } from './shards.fixtures';

type MongoUploadModel = Required<Omit<Upload, 'id'>> & {
  _id: ObjectId;
};

const formatUpload = ({ _id, ...model }: MongoUploadModel): Upload => ({
  ...model,
  id: _id.toString(),
});

const uploadsTest: MongoUploadModel[] = [
  {
    _id: new ObjectId('628ced94daeda9001f828b0b'),
    uuid: shards[0].uuid,
    index: 0,
    data_size: 7298260,
    contracts: [
      {
        nodeID: '9a1c78a507689f6f54b847ad1cef1e614ee23f1e',
        contract: {
          version: 1,
          farmer_id: '9a1c78a507689f6f54b847ad1cef1e614ee23f1e',
          data_size: 7298260,
          store_begin: new Date('2022-05-24T14:37:08.215Z').valueOf(),
        },
      },
    ],
  },
  {
    _id: new ObjectId('628ced94daeda9001f828b0c'),
    uuid: shards[1].uuid,
    index: 1,
    data_size: 7298260,
    contracts: [
      {
        nodeID: '9a1c78a507689f6f54b847ad1cef1e614ee23f1e',
        contract: {
          version: 1,
          farmer_id: '9a1c78a507689f6f54b847ad1cef1e614ee23f1e',
          data_size: 7298260,
          store_begin: new Date('2022-05-24T14:37:08.215Z').valueOf(),
        },
      },
    ],
  },
];

export const uploads: MongoUploadModel[] = uploadsTest;
export const uploadFixtures: Upload[] = uploadsTest.map(formatUpload);
