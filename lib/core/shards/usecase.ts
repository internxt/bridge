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

  enqueueDeleteShardMessages = async(hashes: string[], version: number) => {
    for(const hash of hashes) {
      const mirrors = await this.mirrorsRepository.findByShardHashesWithContacts([hash]);
      const stillExistentMirrors = mirrors.filter((mirror) => {
        return mirror.contact && mirror.contact.address && mirror.contact.port;
      });

      for (const { contact } of stillExistentMirrors) {
        const { address, port } = contact;

        let url: string;
        
        if(version === 1){
          url = `http://${address}:${port}/shards/${hash}`;
        }
        else if (version === 2) {
          url = `http://${address}:${port}/v2/shards/${hash}`;
        }
        else {
          throw new BucketEntryVersionNotFoundError();
        }

        this.networkQueue.enqueueMessage({
          type: DELETING_FILE_MESSAGE,
          payload: { hash, url }
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
