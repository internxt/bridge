import { config } from 'dotenv';
import { contractsFixtures } from '../fixtures/contacts.fixtures';
import { unloadLoadFixtures } from '../fixtures/init-fixtures';
import { setupAndValidateStorageForFixtures } from './utils';
import { MongoDBContactsRepository } from '../../../../lib/core/contacts/MongoDBContactsRepository';

config();

const { storage, uri, BRIDGE_TEST_DB_NAME } =
  setupAndValidateStorageForFixtures();

let repository: MongoDBContactsRepository = new MongoDBContactsRepository(
  storage.models.Contact
);

const [contact1, contact2] = contractsFixtures;

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

describe('Contacts repository', () => {
  it('findById()', async () => {
    const contact = await repository.findById(contact2.id);

    expect(contact).not.toBeNull();
    expect(contact).toStrictEqual(contact2);
  });

  it('findById() - not found', async () => {
    const nonExistentId = '233433';
    const contact = await repository.findById(nonExistentId);

    expect(contact).toBeNull();
  });

  it('findByIds()', async () => {
    const contacts = await repository.findByIds([contact1.id, contact2.id]);

    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toStrictEqual(contact1);
    expect(contacts[1]).toStrictEqual(contact2);
  });
});
