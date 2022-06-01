import { ObjectId } from 'mongodb';
import { Frame } from '../../../../lib/core/frames/Frame';

type MongoFrameModel = Required<
  Omit<Frame, 'id' | 'shards' | 'bucketEntry'>
> & {
  _id: ObjectId;
  shards: ObjectId[];
};

const formatFrame = ({ _id, ...model }: MongoFrameModel): Frame => ({
  ...model,
  id: _id.toString(),
  shards: model.shards.map((shard) => shard.toString()),
});

const framesTest: MongoFrameModel[] = [
  {
    _id: new ObjectId('6294dc39d716b2000771e856'),
    user: 'user@user.com',
    shards: [
      new ObjectId('6294dc394329da00076670d5'),
      new ObjectId('6294dc3993fbb80008aa83e4'),
      new ObjectId('6294dc399a7a0b0007226831'),
      new ObjectId('6294dc39b225f500068d2da4'),
    ],
    storageSize: 6738906,
    size: 2544602,
    locked: false,
    created: new Date('2022-05-30T15:01:13.064Z'),
  },
  {
    _id: new ObjectId('7294dc39d716b2000771e856'),
    user: 'user2@user.com',
    shards: [new ObjectId('6294dc39b225f500068d2da5')],
    storageSize: 6738906,
    size: 2544602,
    locked: false,
    created: new Date('2022-05-30T15:01:13.064Z'),
  },
];

export const frames: MongoFrameModel[] = framesTest;
export const framesFixtures: Frame[] = framesTest.map(formatFrame);
