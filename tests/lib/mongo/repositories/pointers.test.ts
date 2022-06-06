import { config } from 'dotenv';
import {
  MongoDBPointersRepository,
  formatFromMongoToPointer,
} from '../../../../lib/core/pointers/MongoDBPointersRepository';
import { pointerFixtures } from '../fixtures/pointers.fixtures';
import { unloadLoadFixtures } from '../fixtures/init-fixtures';
import { setupAndValidateStorageForFixtures } from './utils';

config();

const { storage, uri, BRIDGE_TEST_DB_NAME } =
  setupAndValidateStorageForFixtures();

let repository: MongoDBPointersRepository = new MongoDBPointersRepository(
  storage.models.Pointer
);

const [pointer1, pointer2] = pointerFixtures;
beforeEach((ready) => {
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

describe('Pointers repository', () => {
  describe('findByIds', () => {
    it('findByIds()', async () => {
      const pointers = await repository.findByIds([pointer1.id, pointer2.id]);
      expect(pointers).toHaveLength(2);
      expect(pointers).toEqual(expect.arrayContaining([pointer1, pointer2]));
    });

    it('findByIds() - not found', async () => {
      const nonExistingId = '6294dc394329da0007667aaa';
      expect(repository.findByIds([nonExistingId])).resolves.toHaveLength(0);
    });
  });

  it('deleteByIds()', async () => {
    await repository.deleteByIds([pointer1.id, pointer2.id]);

    expect(
      repository.findByIds([pointer1.id, pointer2.id])
    ).resolves.toHaveLength(0);
  });
});
