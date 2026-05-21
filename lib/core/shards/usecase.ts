import { MirrorsRepository } from '../mirrors/Repository';
import log from '../../logger';
import { ContactsRepository } from '../contacts/Repository';
import { Contact } from '../contacts/Contact';
import { MirrorWithContact } from '../mirrors/Mirror';
import { getQueue } from '../queue/bullQueue';

export class ShardsUsecase {
  constructor(
    private readonly mirrorsRepository: MirrorsRepository,
    private readonly contactsRepository: ContactsRepository, 
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

    const byFarmer = new Map<string, { url: string, keys: string[] }>();

    for (const { contact, shardHash } of stillExistentMirrors) {
      const { address, port } = contact;
      const farmerKey = `${address}:${port}`;
      const shard = shards.find(s => s.hash === shardHash);
      if (!shard) continue;

      if (!byFarmer.has(farmerKey)) {
        byFarmer.set(farmerKey, { url: `http://${address}:${port}/v2/shards`, keys: [] });
      }
      byFarmer.get(farmerKey)!.keys.push(shard.uuid);
    }

    const q = getQueue();
    if (!q) {
      console.error('deleteShards: BullMQ queue not initialized');
    } else {
      for (const { url, keys } of Array.from(byFarmer.values())) {
        for (let i = 0; i < keys.length; i += 50) {
          const chunk = keys.slice(i, i + 50);
          log.info('deleteShards: enqueuing batch of %d keys to %s: %s', chunk.length, url, chunk.join(', '));
          q.add('delete-shards-batch', { url, keys: chunk }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          }).catch((err) => {
            console.error('deleteShards: Error enqueuing BullMQ batch job: %s', err.message);
          });
        }
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
