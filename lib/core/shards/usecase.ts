import { MirrorsRepository } from '../mirrors/Repository';
import { ShardsRepository } from './Repository';
import NetworkMessageQueue from "../../server/queues/networkQueue";
import { DELETING_FILE_MESSAGE } from "../../server/queues/messageTypes";
import { BucketEntryVersionNotFoundError } from '../bucketEntries/usecase';

export class ShardsUsecase {
  constructor(
    private shardsRepository: ShardsRepository,
    private mirrorsRepository: MirrorsRepository,
    private networkQueue: NetworkMessageQueue
  ) {}

  deleteShardsStorageByUuids = async (uuids: string []) => {
    for(const uuid of uuids) {
      const mirrors = await this.mirrorsRepository.findByShardUuidsWithContacts([uuid]);
      const stillExistentMirrors = mirrors.filter((mirror) => {
        return mirror.contact && mirror.contact.address && mirror.contact.port;
      });

      for (const { contact } of stillExistentMirrors) {
        const { address, port } = contact;
        
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
    }
  }

  deleteShardsStorageByHashes = async(hashes: string[]) => {
    for(const hash of hashes) {
      const mirrors = await this.mirrorsRepository.findByShardHashesWithContacts([hash]);
      const stillExistentMirrors = mirrors.filter((mirror) => {
        return mirror.contact && mirror.contact.address && mirror.contact.port;
      });

      for (const { contact } of stillExistentMirrors) {
        const { address, port } = contact;

        const url = `http://${address}:${port}/shards/${hash}`;

        this.networkQueue.enqueueMessage({
          type: DELETING_FILE_MESSAGE,
          payload: { key: hash, hash, url }
        }, (err: Error | undefined) => {
          if (err) {
            console.error(
              'Error enqueuing delete shard hash %s : %s', 
              hash, 
              err.message
            );
          }
        })
      }
    }
  }
}
