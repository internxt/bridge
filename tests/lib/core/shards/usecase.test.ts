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
    it('When mirrors exist, then enqueues one batch job per farmer', async () => {
      const shardsToDelete = [fixtures.getShard(), fixtures.getShard()];
      const contacts = shardsToDelete.map((s) => fixtures.getContact({ id: s.contracts[0].nodeID }));
      const mirrors: MirrorWithContact[] = contacts.map((c, i) => ({
        ...fixtures.getMirror(),
        shardHash: shardsToDelete[i].hash,
        contact: c,
      }));

      stub(mirrorsRepository, 'findByShardHashesWithContacts').resolves(mirrors);
      stub(contactsRepository, 'findByIds').resolves();
      const deleteMirrorsByIds = stub(mirrorsRepository, 'deleteByIds').resolves();

      const add = stub().resolves({ id: 'job-id-1' });
      stub(BullQueueModule, 'getQueue').returns({ add } as any);

      await usecase.deleteShardsStorageByUuids(shardsToDelete as (Shard & { uuid: string })[]);

      expect(add.callCount).toEqual(2);
      add.args.forEach((args, i) => {
        const shard = shardsToDelete[i];
        const contact = contacts[i];
        expect(args[0]).toEqual('delete-shards-batch');
        expect(args[1]).toEqual({
          url: `http://${contact.address}:${contact.port}/v2/shards`,
          keys: [shard.uuid],
        });
      });

      expect(deleteMirrorsByIds.calledOnce).toBeTruthy();
      expect(deleteMirrorsByIds.firstCall.args).toStrictEqual([mirrors.map((m) => m.id)]);
    });

    it('When multiple shards share the same farmer, then enqueues a single batch job with all keys', async () => {
      const contact = fixtures.getContact();
      const shardsToDelete = [
        fixtures.getShard({ contracts: [{ nodeID: contact.id, contract: {} as any }] }),
        fixtures.getShard({ contracts: [{ nodeID: contact.id, contract: {} as any }] }),
      ];
      const mirrors: MirrorWithContact[] = shardsToDelete.map((s) => ({
        ...fixtures.getMirror(),
        shardHash: s.hash,
        contact,
      }));

      stub(mirrorsRepository, 'findByShardHashesWithContacts').resolves(mirrors);
      stub(contactsRepository, 'findByIds').resolves();
      stub(mirrorsRepository, 'deleteByIds').resolves();

      const add = stub().resolves({ id: 'job-id-1' });
      stub(BullQueueModule, 'getQueue').returns({ add } as any);

      await usecase.deleteShardsStorageByUuids(shardsToDelete as (Shard & { uuid: string })[]);

      expect(add.callCount).toEqual(1);
      expect(add.firstCall.args[0]).toEqual('delete-shards-batch');
      expect(add.firstCall.args[1]).toEqual({
        url: `http://${contact.address}:${contact.port}/v2/shards`,
        keys: shardsToDelete.map((s) => s.uuid),
      });
    });

    it('When a farmer has more than 50 shards, then enqueues multiple chunks of 50', async () => {
      const contact = fixtures.getContact();
      const shardsToDelete = Array.from({ length: 55 }, () =>
        fixtures.getShard({ contracts: [{ nodeID: contact.id, contract: {} as any }] })
      );
      const mirrors: MirrorWithContact[] = shardsToDelete.map((s) => ({
        ...fixtures.getMirror(),
        shardHash: s.hash,
        contact,
      }));

      stub(mirrorsRepository, 'findByShardHashesWithContacts').resolves(mirrors);
      stub(contactsRepository, 'findByIds').resolves();
      stub(mirrorsRepository, 'deleteByIds').resolves();

      const add = stub().resolves({ id: 'job-id-1' });
      stub(BullQueueModule, 'getQueue').returns({ add } as any);

      await usecase.deleteShardsStorageByUuids(shardsToDelete as (Shard & { uuid: string })[]);

      expect(add.callCount).toEqual(2);
      expect(add.firstCall.args[1].keys).toHaveLength(50);
      expect(add.secondCall.args[1].keys).toHaveLength(5);
    });

    it('When mirrors do not exist, then uses contracts as fallback to delete shards', async () => {
      const shardsToDelete = [fixtures.getShard(), fixtures.getShard()];
      const contacts = shardsToDelete.map((s) => fixtures.getContact({ id: s.contracts[0].nodeID }));
      const mirrors: MirrorWithContact[] = [];

      stub(mirrorsRepository, 'findByShardHashesWithContacts').resolves(mirrors);
      const findContactsByIds = stub(contactsRepository, 'findByIds').resolves(contacts);
      const deleteMirrorsByIds = stub(mirrorsRepository, 'deleteByIds').resolves();

      const add = stub().resolves({ id: 'job-id-1' });
      stub(BullQueueModule, 'getQueue').returns({ add } as any);

      await usecase.deleteShardsStorageByUuids(shardsToDelete as (Shard & { uuid: string })[]);

      expect(findContactsByIds.calledOnce).toBeTruthy();
      expect(findContactsByIds.firstCall.args).toStrictEqual([
        shardsToDelete.flatMap((s) => s.contracts.flatMap((c) => c.nodeID)),
      ]);

      expect(add.callCount).toEqual(2);
      add.args.forEach((args, i) => {
        const shard = shardsToDelete[i];
        const contact = contacts[i];
        expect(args[0]).toEqual('delete-shards-batch');
        expect(args[1]).toEqual({
          url: `http://${contact.address}:${contact.port}/v2/shards`,
          keys: [shard.uuid],
        });
      });

      expect(deleteMirrorsByIds.notCalled).toBeTruthy();
    });
  });
});
