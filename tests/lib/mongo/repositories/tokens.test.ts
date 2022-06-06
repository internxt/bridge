import { config } from 'dotenv';
import { MongoDBTokensRepository } from '../../../../lib/core/tokens/MongoDBTokensRepository';
import { tokenFixtures } from '../fixtures/tokens.fixtures';
import { unloadLoadFixtures } from '../fixtures/init-fixtures';
import { setupAndValidateStorageForFixtures } from './utils';

config();

const { storage, uri, BRIDGE_TEST_DB_NAME } =
  setupAndValidateStorageForFixtures();

let repository: MongoDBTokensRepository = new MongoDBTokensRepository(
  storage.models.Token
);

const [token1] = tokenFixtures;

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

describe('Tokens repository', () => {
  describe('findOne', () => {
    it('findOne()', async () => {
      const token = await repository.findById(token1.id);
      expect(token).toStrictEqual(token1);
    });

    it('findOne() - not found', async () => {
      const token = await repository.findById('not-found');

      expect(token).toBeNull();
    });
  });
});
