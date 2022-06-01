import { config } from 'dotenv';
import { MongoDBBucketsRepository } from '../../../../lib/core/buckets/MongoDBBucketsRepository';
import { bucketsFixtures } from '../fixtures/buckets.fixtures';
import { unloadLoadFixtures } from '../fixtures/init-fixtures';
import { setupAndValidateStorageForFixtures } from './utils';

config();

const { storage, uri, BRIDGE_TEST_DB_NAME } =
  setupAndValidateStorageForFixtures();

let repository: MongoDBBucketsRepository = new MongoDBBucketsRepository(
  storage.models.User
);

const [user1, user2] = bucketsFixtures;

beforeEach((ready) => {
  console.log(uri, BRIDGE_TEST_DB_NAME);
  unloadLoadFixtures(uri, BRIDGE_TEST_DB_NAME).then(() => {
    ready();
  });
});

afterAll((finish) => {
  unloadLoadFixtures(uri, BRIDGE_TEST_DB_NAME).then(() => {
    storage.connection.close();
    finish();
  });
});

describe('Buckets repository', () => {
  it('findOne()', async () => {
    const bucket = await repository.findOne({
      user: user2.user,
      name: user2.name,
    });

    expect(bucket).not.toBeNull();
    expect(bucket).toStrictEqual(user2);
  });

  it('findOne() - not found', async () => {
    const bucket = await repository.findOne({
      user: 'doesntexist@user.com',
      name: 'Bucket-914bfb',
    });

    expect(bucket).toBeNull();
  });

  it('findByIds()', async () => {
    const buckets = await repository.findByIds([user1.id, user2.id]);

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toStrictEqual(user1);
    expect(buckets[1]).toStrictEqual(user2);
  });

  it('find()', async () => {
    const buckets = await repository.find({
      user: user2.user,
    });

    expect(buckets).toHaveLength(2);
  });

  it('removeAll()', async () => {
    await repository.removeAll({});
    expect(repository.find({})).resolves.toHaveLength(0);
  });

  it('removeAll() with filter', async () => {
    // WILL NOT WORK WITH ID:
    await repository.removeAll({ name: user1.name });
    expect(repository.find({})).resolves.toHaveLength(1);
  });
});
