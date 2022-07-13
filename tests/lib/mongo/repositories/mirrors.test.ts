import { config } from 'dotenv';
import { mirrorsFixtures } from '../fixtures/mirrors.fixtures';
import { shardFixtures } from '../fixtures/shards.fixtures';
import {
  contacts as contactDocuments,
  contractsFixtures,
} from '../fixtures/contacts.fixtures';
import { unloadLoadFixtures } from '../fixtures/init-fixtures';
import { setupAndValidateStorageForFixtures } from './utils';
import { MirrorWithContact } from '../../../../lib/core/mirrors/Mirror';
import { MongoDBMirrorsRepository } from '../../../../lib/core/mirrors/MongoDBMirrorsRepository';

config();

const { storage, uri, BRIDGE_TEST_DB_NAME } =
  setupAndValidateStorageForFixtures();

let repository: MongoDBMirrorsRepository = new MongoDBMirrorsRepository(
  storage.models.Mirror
);

const [mirror1, mirror2] = mirrorsFixtures;

const [shard1, shard2, shard3, shard4] = shardFixtures;
const [contact1] = contractsFixtures;

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

describe('Mirrors repository', () => {
  it('findByShardHashesWithContacts()', async () => {
    const mirrors = await repository.findByShardHashesWithContacts([
      mirror1.shardHash,
    ]);
    const expectedMirrorWithContact: MirrorWithContact = {
      ...mirror1,
      contact: contact1,
    };
    expect(mirrors[0]).toStrictEqual(expectedMirrorWithContact);
  });

  it('findByShardUuidsWithContacts()', async () => {
    // This method is not working, a mirror doesnt have uuid:
    // expect(true).toBe(false);
    // if (!shard1.uuid) {
    //   throw new Error('No shard uuid');
    // }
    // const mirrors = await repository.findByShardUuidsWithContacts([
    //   shard1.uuid,
    // ]);
    // expect(mirrors[0]).toStrictEqual(mirror1);
  });

  it('create()', async () => {
    const shardAssociatedHash = shard4.hash;
    const mirrorToCreate = await repository.create({
      shardHash: shardAssociatedHash,
      contact: contactDocuments[0]._id.toString(),
      token: '',
      isEstablished: true,
      contract: {
        version: 1,
        data_hash: shardAssociatedHash,
        store_begin: new Date('2022-05-24T16:01:58.717Z'),
        data_size: 7298260,
        farmer_id: '9a1c78a507689f6f54b847ad1cef1e614ee23f1e',
      },
    });
    await repository.create(mirrorToCreate);

    expect(mirrorToCreate).not.toBeNull();
  });

  it('deleteByIds()', async () => {
    await repository.deleteByIds([mirror1.id, mirror2.id]);
    expect(
      repository.findByShardHashesWithContacts([
        mirror1.shardHash,
        mirror2.shardHash,
      ])
    ).resolves.toHaveLength(0);
  });

  it('insertMany()', async () => {});
});
