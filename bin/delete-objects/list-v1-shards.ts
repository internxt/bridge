import { EventEmitter } from 'events';
import { ShardsReader } from './ObjectStorage';

/**
 * Lists all the shards that are from the version 1 of the protocol 
 * and that have a contract with the given nodeID.
 * 
 * @param shardsReader
 * @param nodeID
 */
export default function (shardsReader: ShardsReader, nodeID: string): EventEmitter {
  const eventsEmitter = new EventEmitter();

  let deletedCount = 0;
  let notifyProgressIntervalId = setInterval(() => {
    eventsEmitter.emit('progress', { deletedCount });
  }, 3000);

  async function listShards() {
    for await (const shard of shardsReader.list(500)) {
      if (shardsReader.isV1(shard)) {
        const size = shard.contracts && shard.contracts.length > 0 && shard.contracts[0].contract?.data_size || shard.size || 0;
  
        if (shard.contracts && shard.contracts.length > 0) {
          const containsContractWithOurFarmer = shard.contracts.some(c => c.nodeID === nodeID);
  
          if (containsContractWithOurFarmer) {
            eventsEmitter.emit('data', { ...shard, size });
          }
        }        
        deletedCount += 1;
      }
    } 
  }

  listShards()
    .then(() => {
      eventsEmitter.emit('end');
    })
    .catch((err) => {
      eventsEmitter.emit('error', err);
    })
    .finally(() => {
      clearInterval(notifyProgressIntervalId);
    });

  return eventsEmitter;
};
