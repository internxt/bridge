import { restore, stub } from 'sinon';
import fixtures from '../fixtures';

import { MirrorsRepository } from '../../../../lib/core/mirrors/Repository';
import { ShardsUsecase } from '../../../../lib/core/shards/usecase';
import { MongoDBMirrorsRepository } from '../../../../lib/core/mirrors/MongoDBMirrorsRepository';
import { MongoDBContactsRepository } from '../../../../lib/core/contacts/MongoDBContactsRepository';
import { ContactsRepository } from '../../../../lib/core/contacts/Repository';
import NetworkMessageQueue from '../../../../lib/server/queues/networkQueue';
import { DELETING_FILE_MESSAGE } from '../../../../lib/server/queues/messageTypes';
import { Shard } from '../../../../lib/core/shards/Shard';
import { MirrorWithContact } from '../../../../lib/core/mirrors/Mirror';

describe('ShardsUsecase', () => {
  let mirrorsRepository: MirrorsRepository = new MongoDBMirrorsRepository({});
  let contactsRepository: ContactsRepository = new MongoDBContactsRepository({});
  const queue = new NetworkMessageQueue({
    connection: {
      url: `amqp://fake@fake`,
    },
    exchange: {
      name: 'exchangeName',
      type: 'direct',
    },
    queue: {
      name: 'fake_name',
    },
    routingKey: {
      name: 'routingKeyName',
    },
  });

  let usecase = new ShardsUsecase(mirrorsRepository, contactsRepository, queue);
  
  beforeEach(() => {
    mirrorsRepository = new MongoDBMirrorsRepository({});
    contactsRepository = new MongoDBContactsRepository({});

    usecase = new ShardsUsecase(
      mirrorsRepository,
      contactsRepository,
      queue,
    );

    restore();
  });

  describe('deleteShardsStorageByUuids()', () => {
    it('When mirrors exist, then it deletes them properly', async () => {
      const shardsToDelete = [fixtures.getShard(), fixtures.getShard()];
      const [firstShard, secondShard] = shardsToDelete;
      const contacts = shardsToDelete.map(s => fixtures.getContact({ id: s.contracts[0].nodeID }))
      const mirrors: MirrorWithContact[] = contacts.map((c, i) => ({
        ...fixtures.getMirror(),
        shardHash: shardsToDelete[i].hash,
        contact: c,
      }));
      const [firstMirror, secondMirror] = mirrors;

      const findByShardHashes = stub(mirrorsRepository, 'findByShardHashesWithContacts').resolves(mirrors);
      const findContactsByIds = stub(contactsRepository, 'findByIds').resolves();
      const enqueueMessage = stub(queue, 'enqueueMessage').resolves();
      const deleteMirrorsByIds = stub(mirrorsRepository, 'deleteByIds').resolves();

      await usecase.deleteShardsStorageByUuids(
        shardsToDelete as (Shard & { uuid: string })[]
      );

      expect(findByShardHashes.calledOnce).toBeTruthy();
      expect(findByShardHashes.firstCall.args).toStrictEqual([shardsToDelete.map(s => s.hash)]);
      expect(findContactsByIds.notCalled).toBeTruthy();
      expect(enqueueMessage.callCount).toEqual(mirrors.length);
      expect(enqueueMessage.firstCall.args[0]).toEqual({
        type: DELETING_FILE_MESSAGE,
        payload: {
          key: firstShard.uuid,
          hash: firstShard.uuid,
          url: `http://${firstMirror.contact.address}:${firstMirror.contact.port}/v2/shards/${firstShard.uuid}`
        }
      })
      expect(enqueueMessage.secondCall.args[0]).toEqual({
        type: DELETING_FILE_MESSAGE,
        payload: {
          key: secondShard.uuid,
          hash: secondShard.uuid,
          url: `http://${secondMirror.contact.address}:${secondMirror.contact.port}/v2/shards/${secondShard.uuid}` 
        }
      });
      expect(deleteMirrorsByIds.calledOnce).toBeTruthy();
      expect(deleteMirrorsByIds.firstCall.args).toStrictEqual([mirrors.map(m => m.id)]);
    });

    it('When mirrors do not exist, then uses contracts as fallback to delete shards', async () => {
      const shardsToDelete = [fixtures.getShard(), fixtures.getShard()];
      const [firstShard, secondShard] = shardsToDelete;
      const contacts = shardsToDelete.map(s => fixtures.getContact({ id: s.contracts[0].nodeID }))
      const [firstContact, secondContact] = contacts;
      const mirrors: MirrorWithContact[] = [];

      const findByShardHashes = stub(mirrorsRepository, 'findByShardHashesWithContacts').resolves(mirrors);
      const findContactsByIds = stub(contactsRepository, 'findByIds').resolves(contacts);
      const enqueueMessage = stub(queue, 'enqueueMessage').resolves();
      const deleteMirrorsByIds = stub(mirrorsRepository, 'deleteByIds').resolves();

      await usecase.deleteShardsStorageByUuids(
        shardsToDelete as (Shard & { uuid: string })[]
      );

      expect(findByShardHashes.calledOnce).toBeTruthy();
      expect(findByShardHashes.firstCall.args).toStrictEqual([shardsToDelete.map(s => s.hash)]);
      expect(findContactsByIds.calledOnce).toBeTruthy();
      expect(findContactsByIds.firstCall.args).toStrictEqual([
        shardsToDelete.flatMap(s => s.contracts.flatMap(c => c.nodeID))
      ]);
      expect(enqueueMessage.callCount).toEqual(
        shardsToDelete.reduce((a, s) => a + s.contracts.length, 0)
      );
      expect(enqueueMessage.firstCall.args[0]).toEqual({
        type: DELETING_FILE_MESSAGE,
        payload: {
          key: firstShard.uuid,
          hash: firstShard.uuid,
          url: `http://${firstContact.address}:${firstContact.port}/v2/shards/${firstShard.uuid}`
        }
      })
      expect(enqueueMessage.secondCall.args[0]).toEqual({
        type: DELETING_FILE_MESSAGE,
        payload: {
          key: secondShard.uuid,
          hash: secondShard.uuid,
          url: `http://${secondContact.address}:${secondContact.port}/v2/shards/${secondShard.uuid}` 
        }
      });
      expect(deleteMirrorsByIds.notCalled).toBeTruthy();
    });
  });
});
