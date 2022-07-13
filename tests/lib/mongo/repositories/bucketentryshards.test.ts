import { config } from 'dotenv';
import { bucketEntryShardFixtures } from '../fixtures/bucketentryshards.fixtures';
import { bucketentries as bucketEntryDocuments } from '../fixtures/bucketentries.fixtures';
import { shards as shardsDocuments } from '../fixtures/shards.fixtures';
import { unloadLoadFixtures } from '../fixtures/init-fixtures';
import { setupAndValidateStorageForFixtures } from './utils';
import { MongoDBBucketEntryShardsRepository } from '../../../../lib/core/bucketEntryShards/MongoDBBucketEntryShardsRepository';

config();

const { storage, uri, BRIDGE_TEST_DB_NAME } =
  setupAndValidateStorageForFixtures();

let repository: MongoDBBucketEntryShardsRepository =
  new MongoDBBucketEntryShardsRepository(storage.models.BucketEntryShard);

const [bucketEntryShard1, bucketEntryShard2, bucketEntryShard3] =
  bucketEntryShardFixtures;

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

describe('BucketEntryShards repository', () => {
  it('findByBucketEntry()', async () => {
    const bucketEntryId = bucketEntryDocuments[0]._id.toString();
    const bucketEntryShards = await repository.findByBucketEntry(bucketEntryId);

    expect(bucketEntryShards).toEqual(
      expect.arrayContaining([
        bucketEntryShard1,
        bucketEntryShard2,
        bucketEntryShard3,
      ])
    );
  });

  it('findByBucketEntries()', async () => {
    const bucketEntryShards = await repository.findByBucketEntries(
      bucketEntryDocuments.map(({ _id }) => _id.toString())
    );

    expect(bucketEntryShards).toEqual(
      expect.arrayContaining([
        bucketEntryShard1,
        bucketEntryShard2,
        bucketEntryShard3,
      ])
    );
  });

  it('findByBucketEntrySortedByIndex()', async () => {
    const bucketEntryId = bucketEntryDocuments[0]._id.toString();
    const sortedResult = await repository.findByBucketEntrySortedByIndex(
      bucketEntryId
    );

    const sortedExpected = [
      bucketEntryShard1,
      bucketEntryShard2,
      bucketEntryShard3,
    ]
      .filter(({ bucketEntry }) => bucketEntry === bucketEntryId)
      .sort(({ index: index1 }, { index: index2 }) => index1 - index2);

    expect(sortedResult).toStrictEqual(sortedExpected);
  });

  it('create()', async () => {
    const shardToAssociateId = shardsDocuments[0]._id.toString();
    const bucketEntryShardToCreate = await repository.create({
      bucketEntry: bucketEntryDocuments[0]._id.toString(),
      shard: shardToAssociateId,
      index: 0,
    });

    expect(bucketEntryShardToCreate).not.toBeNull();
  });

  it('deleteByIds()', async () => {
    await repository.deleteByIds([bucketEntryShard1.id]);

    const bucketEntriesWithoutIt = await repository.findByBucketEntry(
      bucketEntryShard1.bucketEntry
    );

    expect(bucketEntriesWithoutIt).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bucketEntryShard1.id,
        }),
      ])
    );
  });

  it('insertMany()', async () => {
    const inserted = await repository.insertMany([
      {
        bucketEntry: bucketEntryDocuments[2]._id.toString(),
        shard: shardsDocuments[0]._id.toString(),
        index: 0,
      },
      {
        bucketEntry: bucketEntryDocuments[2]._id.toString(),
        shard: shardsDocuments[1]._id.toString(),
        index: 1,
      },
    ]);

    const bucketEntryShards = await repository.findByBucketEntry(
      bucketEntryDocuments[2]._id.toString()
    );

    expect(bucketEntryShards).toHaveLength(2);
  });
});
