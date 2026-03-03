import { restore, stub } from 'sinon';
import fixtures from '../fixtures';

import { MirrorsRepository } from '../../../../lib/core/mirrors/Repository';
import { ShardsUsecase } from '../../../../lib/core/shards/usecase';
import { MongoDBMirrorsRepository } from '../../../../lib/core/mirrors/MongoDBMirrorsRepository';
import { MongoDBContactsRepository } from '../../../../lib/core/contacts/MongoDBContactsRepository';
import { ContactsRepository } from '../../../../lib/core/contacts/Repository';
import { Shard } from '../../../../lib/core/shards/Shard';
import { MirrorWithContact } from '../../../../lib/core/mirrors/Mirror';
import * as BullQueueModule from '../../../../lib/core/queue/bullQueue';

describe('ShardsUsecase', () => {
  let mirrorsRepository: MirrorsRepository = new MongoDBMirrorsRepository({});
  let contactsRepository: ContactsRepository = new MongoDBContactsRepository({});

  let usecase = new ShardsUsecase(mirrorsRepository, contactsRepository);
  
  beforeEach(() => {
    mirrorsRepository = new MongoDBMirrorsRepository({});
    contactsRepository = new MongoDBContactsRepository({});
    usecase = new ShardsUsecase(mirrorsRepository, contactsRepository);
    restore();
  });

  describe('deleteShardsStorageByUuids()', () => {
    it('When mirrors exist, then it deletes them properly', async () => {
      const shardsToDelete = [fixtures.getShard(), fixtures.getShard()];
      const [firstShard, secondShard] = shardsToDelete;
      const contacts = shardsToDelete.map((s) => fixtures.getContact({ id: s.contracts[0].nodeID }));
      const mirrors: MirrorWithContact[] = contacts.map((c, i) => ({
        ...fixtures.getMirror(),
        shardHash: shardsToDelete[i].hash,
        contact: c,
      }));
      const [firstMirror, secondMirror] = mirrors;

      const findByShardHashes = stub(mirrorsRepository, 'findByShardHashesWithContacts').resolves(mirrors);
      const findContactsByIds = stub(contactsRepository, 'findByIds').resolves();
      const deleteMirrorsByIds = stub(mirrorsRepository, 'deleteByIds').resolves();

      const add = stub().resolves({ id: 'job-id-1' });
      stub(BullQueueModule, 'getQueue').returns({ add } as any);

      await usecase.deleteShardsStorageByUuids(shardsToDelete as (Shard & { uuid: string })[]);

      expect(findByShardHashes.calledOnce).toBeTruthy();
      expect(findByShardHashes.firstCall.args).toStrictEqual([shardsToDelete.map((s) => s.hash)]);
      expect(findContactsByIds.notCalled).toBeTruthy();

      expect(add.callCount).toEqual(mirrors.length);
      expect(add.firstCall.args[0]).toEqual('delete-shard');
      expect(add.firstCall.args[1]).toEqual({
        key: firstShard.uuid,
        hash: firstShard.uuid,
        url: `http://${firstMirror.contact.address}:${firstMirror.contact.port}/v2/shards/${firstShard.uuid}`,
      });

      expect(add.secondCall.args[0]).toEqual('delete-shard');
      expect(add.secondCall.args[1]).toEqual({
        key: secondShard.uuid,
        hash: secondShard.uuid,
        url: `http://${secondMirror.contact.address}:${secondMirror.contact.port}/v2/shards/${secondShard.uuid}`,
      });

      expect(deleteMirrorsByIds.calledOnce).toBeTruthy();
      expect(deleteMirrorsByIds.firstCall.args).toStrictEqual([mirrors.map((m) => m.id)]);
    });

    it('When mirrors do not exist, then uses contracts as fallback to delete shards', async () => {
      const shardsToDelete = [fixtures.getShard(), fixtures.getShard()];
      const [firstShard, secondShard] = shardsToDelete;
      const contacts = shardsToDelete.map((s) => fixtures.getContact({ id: s.contracts[0].nodeID }));
      const [firstContact, secondContact] = contacts;
      const mirrors: MirrorWithContact[] = [];

      const findByShardHashes = stub(mirrorsRepository, 'findByShardHashesWithContacts').resolves(mirrors);
      const findContactsByIds = stub(contactsRepository, 'findByIds').resolves(contacts);
      const deleteMirrorsByIds = stub(mirrorsRepository, 'deleteByIds').resolves();

      const add = stub().resolves({ id: 'job-id-1' });
      stub(BullQueueModule, 'getQueue').returns({ add } as any);

      await usecase.deleteShardsStorageByUuids(shardsToDelete as (Shard & { uuid: string })[]);

      expect(findByShardHashes.calledOnce).toBeTruthy();
      expect(findByShardHashes.firstCall.args).toStrictEqual([shardsToDelete.map((s) => s.hash)]);
      expect(findContactsByIds.calledOnce).toBeTruthy();
      expect(findContactsByIds.firstCall.args).toStrictEqual([
        shardsToDelete.flatMap((s) => s.contracts.flatMap((c) => c.nodeID)),
      ]);

      expect(add.callCount).toEqual(shardsToDelete.reduce((a, s) => a + s.contracts.length, 0));

      expect(add.firstCall.args[0]).toEqual('delete-shard');
      expect(add.firstCall.args[1]).toEqual({
        key: firstShard.uuid,
        hash: firstShard.uuid,
        url: `http://${firstContact.address}:${firstContact.port}/v2/shards/${firstShard.uuid}`,
      });

      expect(add.secondCall.args[0]).toEqual('delete-shard');
      expect(add.secondCall.args[1]).toEqual({
        key: secondShard.uuid,
        hash: secondShard.uuid,
        url: `http://${secondContact.address}:${secondContact.port}/v2/shards/${secondShard.uuid}`,
      });

      expect(deleteMirrorsByIds.notCalled).toBeTruthy();
    });
  });
});
