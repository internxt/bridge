import { config } from 'dotenv';
import { MongoDBShardsRepository } from '../../../../lib/core/shards/MongoDBShardsRepository';
import { shardFixtures } from '../fixtures/shards.fixtures';
import { unloadLoadFixtures } from '../fixtures/init-fixtures';
import { setupAndValidateStorageForFixtures } from './utils';

config();

const { storage, uri, BRIDGE_TEST_DB_NAME } =
  setupAndValidateStorageForFixtures();

let repository: MongoDBShardsRepository = new MongoDBShardsRepository(
  storage.models.Shard
);

const [shard1, shard2] = shardFixtures;

beforeEach((ready) => {
  unloadLoadFixtures(uri, BRIDGE_TEST_DB_NAME).then(() => {
    ready();
  });
});

afterAll((finish) => {
  unloadLoadFixtures(uri, BRIDGE_TEST_DB_NAME)
    .then(async () => {
      await storage.connection.close();
      finish();
    })
    .catch(finish);
});

describe('Shards repository', () => {
  it('findByHashes()', async () => {
    const shards = await repository.findByHashes([shard1.hash, shard2.hash]);
    expect(shards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: shard1.id,
        }),
        expect.objectContaining({
          id: shard2.id,
        }),
      ])
    );
  });

  it('findByIds()', async () => {
    const shards = await repository.findByIds([shard1.id, shard2.id]);

    expect(shards).toHaveLength(2);
    expect(shards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: shard1.id,
        }),
        expect.objectContaining({
          id: shard2.id,
        }),
      ])
    );
  });

  it('create()', async () => {});

  it('deleteByIds()', async () => {
    await repository.deleteByIds([shard1.id, shard2.id]);

    expect(repository.findByIds([shard1.id, shard2.id])).resolves.toHaveLength(
      0
    );
  });

  it('deleteByHashes()', async () => {
    await repository.deleteByHashes([shard1.hash, shard2.hash]);

    expect(repository.findByIds([shard1.id, shard2.id])).resolves.toHaveLength(
      0
    );
  });
});
