import { ObjectId } from 'mongodb';
import { Frame } from '../../../../lib/core/frames/Frame';
// Circular dependency we have to export ids first:
export const frameIds = [
  new ObjectId('6294dc39d716b2000771e856'),
  new ObjectId('7294dc39d716b2000771e856'),
];
import { pointerIds, pointers } from './pointers.fixtures';

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
    _id: frameIds[0],
    user: 'user@user.com',
    shards: [pointerIds[0], pointerIds[1], pointerIds[2], pointerIds[3]],
    storageSize: 6738906,
    size: 2544602,
    locked: false,
    created: new Date('2022-05-30T15:01:13.064Z'),
  },
  {
    _id: frameIds[1],
    user: 'user2@user.com',
    shards: [pointerIds[4]],
    storageSize: 6738906,
    size: 2544602,
    locked: false,
    created: new Date('2022-05-30T15:01:13.064Z'),
  },
];

export const frames: MongoFrameModel[] = framesTest;
export const framesFixtures: Frame[] = framesTest.map(formatFrame);
