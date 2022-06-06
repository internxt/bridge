import { config } from 'dotenv';
import {
  MongoDBBucketEntriesRepository,
  formatFromMongoToBucketEntry,
} from '../../../../lib/core/bucketEntries/MongoDBBucketEntriesRepository';
import { bucketEntryFixtures } from '../fixtures/bucketentries.fixtures';
import { unloadLoadFixtures } from '../fixtures/init-fixtures';
import { BucketEntry } from '../../../../lib/core/bucketEntries/BucketEntry';
import { setupAndValidateStorageForFixtures } from './utils';
import { framesFixtures } from '../fixtures/frames.fixtures';

config();

const { storage, uri, BRIDGE_TEST_DB_NAME } =
  setupAndValidateStorageForFixtures();

let repository: MongoDBBucketEntriesRepository =
  new MongoDBBucketEntriesRepository(storage.models.BucketEntry);

const [bucketEntry1, bucketEntry2, bucketEntry3] = bucketEntryFixtures;

const [frame1] = framesFixtures;

beforeEach((ready) => {
  unloadLoadFixtures(uri, BRIDGE_TEST_DB_NAME)
    .then(() => {
      ready();
    })
    .catch((err) => {
      throw err;
    });
});

afterAll((finish) => {
  unloadLoadFixtures(uri, BRIDGE_TEST_DB_NAME).then(() => {
    storage.connection.close();
    finish();
  });
});

describe('BucketEntry repository', () => {
  describe('findOne', () => {
    it('findOne()', async () => {
      const bucket = await repository.findOne({
        bucket: bucketEntry2.bucket,
        index: bucketEntry2.index,
      });

      expect(bucket).toStrictEqual(bucketEntry2);
    });

    it('findOne() - not found', async () => {
      const bucket = await repository.findOne({
        bucket: '33b814bf3cde6dcc6f6c9a7b',
      });

      expect(bucket).toBeNull();
    });
  });

  it('findByIds()', async () => {
    const bucketentries = await repository.findByIds([
      bucketEntry1.id,
      bucketEntry2.id,
    ]);

    expect(bucketentries).toHaveLength(2);
  });

  it('deleteByIds()', async () => {
    await repository.deleteByIds([bucketEntry1.id]);
    expect(repository.findOne({ id: bucketEntry1.id })).resolves.toBeNull();
  });

  it('deleteByIds() with filter', async () => {
    await repository.deleteByIds([bucketEntry1.id, bucketEntry2.id]);
    expect(
      repository.findByIds([bucketEntry1.id, bucketEntry2.id])
    ).resolves.toHaveLength(0);
  });

  it('findOneWithFrame()', async () => {
    const bucket = await repository.findOneWithFrame({
      bucket: bucketEntry3.bucket,
      index: bucketEntry3.index,
    });

    expect(bucket).toStrictEqual({ ...bucketEntry3, frame: frame1 });
  });
  it('findByIdsWithFrame()', async () => {
    const bucketentries = await repository.findByIdsWithFrames([
      bucketEntry1.id,
      bucketEntry2.id,
    ]);

    expect(bucketentries).toHaveLength(2);
  });
});
