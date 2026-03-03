import { MirrorsRepository } from '../mirrors/Repository';
import NetworkMessageQueue from "../../server/queues/networkQueue";
import { DELETING_FILE_MESSAGE } from "../../server/queues/messageTypes";
import log from '../../logger';
import { ContactsRepository } from '../contacts/Repository';
import { Contact } from '../contacts/Contact';
import { MirrorWithContact } from '../mirrors/Mirror';
import { getQueue } from '../queue/bullQueue';

export class ShardsUsecase {
  constructor(
    private readonly mirrorsRepository: MirrorsRepository,
    private readonly contactsRepository: ContactsRepository, 
    private readonly networkQueue: NetworkMessageQueue
  ) {}

  async deleteShardsStorageByUuids(shards: { 
    hash: string, 
    uuid: string, 
    contracts: ({ nodeID: Contact['id'] })[] 
  }[]) {
    const mirrors = await this.mirrorsRepository.findByShardHashesWithContacts(shards.map(s => s.hash));
    const stillExistentMirrors = mirrors.filter((mirror) => {
      return mirror.contact && mirror.contact.address && mirror.contact.port;
    });

    const noMirrors = stillExistentMirrors.length === 0;

    if (noMirrors) {
      const contactIdsWithShardsHashes = shards.flatMap((s) => 
        s.contracts.map(c => ({ nodeID: c.nodeID, shardHash: s.hash, uuid: s.uuid }))
      );

      const contacts = await this.contactsRepository.findByIds(
        contactIdsWithShardsHashes.map(c => c.nodeID)
      );

      for (const shard of shards) {
        const contactsForGivenShard = contactIdsWithShardsHashes.filter((contactWHash) => {
          return contactWHash.shardHash === shard.hash
        });
        for (const mirror of contactsForGivenShard) {
          stillExistentMirrors.push({
            id: '000000000000000000000000',
            contact: contacts.find(c => c.id === mirror.nodeID) as Contact,
            shardHash: mirror.shardHash
          } as MirrorWithContact);
        }
      }
    } 

    for (const { contact, shardHash } of stillExistentMirrors) {
      const { address, port } = contact;
      const { uuid } = (shards.find(s => s.hash === shardHash) as { hash: string, uuid: string });
      
      const url = `http://${address}:${port}/v2/shards/${uuid}`;

      try {
        const q = getQueue();
        if (!q) {
          console.error('deleteShards: BullMQ queue not initialized, skipping enqueue for shard %s', uuid);
        } else {
          console.log('adding removal of shard %s to the queue', uuid)
          q.add('delete-shard', { key: uuid, hash: uuid, url }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          }).catch((err) => {
            console.error('deleteShards: Error enqueuing BullMQ job for shard %s: %s', uuid, err.message);
          });
        }
      } catch (err: any) {
        console.error('deleteShards: Failed to enqueue BullMQ job for shard %s: %s', uuid, err.message);
      }
    }

    if (!noMirrors && stillExistentMirrors.length > 0) {
      log.info('Deleting still existent mirrors (by uuids): %s from hashes: %s', stillExistentMirrors.map(m => m.id).toString(), shards.toString());

      await this.mirrorsRepository.deleteByIds(stillExistentMirrors.map(m => m.id));
    }
  }

  async deleteShardsStorageByHashes(hashes: string[]) {
    const mirrors = await this.mirrorsRepository.findByShardHashesWithContacts(hashes);
    const stillExistentMirrors = mirrors.filter((mirror) => {
      return mirror.contact && mirror.contact.address && mirror.contact.port;
    });

    for (const { contact, shardHash } of stillExistentMirrors) {
      const { address, port } = contact;

      const url = `http://${address}:${port}/shards/${shardHash}`;

      try {
        const q = getQueue();
        if (!q) {
          console.error('deleteShards: BullMQ queue not initialized, skipping enqueue for shard %s', shardHash);
        } else {
          console.log('adding removal of shard %s to the queue', shardHash)
          q.add('delete-shard', { key: shardHash, hash: shardHash, url }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          }).catch((err) => {
            console.error('deleteShards: Error enqueuing BullMQ job for shard %s: %s', shardHash, err.message);
          });
        }
      } catch (err: any) {
        console.error('deleteShards: Failed to enqueue BullMQ job for shard %s: %s', shardHash, err.message);
      }
    }

    if (stillExistentMirrors.length > 0) {
      log.info(
        'Deleting still existent mirrors (by hashes): %s Shard hashes: %s',
        stillExistentMirrors.map((m) => m.id).toString(),
        hashes.toString()
      );

      await this.mirrorsRepository.deleteByIds(stillExistentMirrors.map(m => m.id));
    }
  }
}
