import { ObjectId } from 'mongodb';
import { Token } from '../../../../lib/core/tokens/Token';
import { buckets } from './buckets.fixtures';

type MongoTokenModel = Required<Omit<Token, 'id' | 'bucket'>> & {
  _id: string;
  bucket: ObjectId;
};

const formatToken = ({ _id, ...model }: MongoTokenModel): Token => ({
  ...model,
  id: _id,
  bucket: model.bucket.toString(),
});

const tokensTest: MongoTokenModel[] = [
  {
    _id: '60f73560ad4cd834d1071ebffbdb00808b5fba0e3b2addf611134a93dd7be08e',
    bucket: buckets[0]._id,
    operation: 'PUSH',
    expires: new Date('2022-05-31T08:23:05.541Z'),
  },
];

export const tokens: MongoTokenModel[] = tokensTest;
export const tokenFixtures: Token[] = tokensTest.map(formatToken);
