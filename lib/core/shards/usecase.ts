import { MirrorsRepository } from '../mirrors/Repository';
import NetworkMessageQueue from "../../server/queues/networkQueue";
import { DELETING_FILE_MESSAGE } from "../../server/queues/messageTypes";
import log from '../../logger';

export class ShardsUsecase {
  constructor(
    private mirrorsRepository: MirrorsRepository,
    private networkQueue: NetworkMessageQueue
  ) {}

  async deleteShardsStorageByUuids(shards: { hash: string, uuid: string }[]) {
    const mirrors = await this.mirrorsRepository.findByShardHashesWithContacts(shards.map(s => s.hash));
    const stillExistentMirrors = mirrors.filter((mirror) => {
      return mirror.contact && mirror.contact.address && mirror.contact.port;
    });

    for (const { contact, shardHash } of stillExistentMirrors) {
      const { address, port } = contact;
      const { uuid } = (shards.find(s => s.hash === shardHash) as { hash: string, uuid: string });
      
      const url = `http://${address}:${port}/v2/shards/${uuid}`;

      this.networkQueue.enqueueMessage({
        type: DELETING_FILE_MESSAGE,
        payload: { key: uuid, hash: uuid, url }
      }, (err: Error | undefined) => {
        if (err) {
          console.error(
            'Error enqueuing delete shard uuid %s : %s',
            uuid, 
            err.message
          );
        }
      })
    }

    if (stillExistentMirrors.length > 0) {
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

      this.networkQueue.enqueueMessage({
        type: DELETING_FILE_MESSAGE,
        payload: { key: shardHash, hash: shardHash, url }
      }, (err: Error | undefined) => {
        if (err) {
          console.error(
            'Error enqueuing delete shard hash %s : %s', 
            shardHash, 
            err.message
          );
        }
      })
    }

    if (stillExistentMirrors.length > 0) {
      log.info(
        'Deleting still existent mirrors (by hashes): %s Shard hashes: ',
        stillExistentMirrors.map((m) => m.id).toString(),
        hashes.toString()
      );

      await this.mirrorsRepository.deleteByIds(stillExistentMirrors.map(m => m.id));
    }
  }
}
