import _ from 'lodash';
import { EventBus, EventBusEvents } from '../../server/eventBus';

import { DELETING_FILE_MESSAGE } from '../../server/queues/messageTypes';
import { BucketEntry } from "../bucketEntries/BucketEntry"
import { BucketEntriesRepository } from "../bucketEntries/Repository";
import { ContactsRepository } from '../contacts/Repository';
import { FramesRepository } from "../frames/Repository";
import { MirrorsRepository } from '../mirrors/Repository';
import { Pointer } from '../pointers/Pointer';
import { PointersRepository } from "../pointers/Repository";
import { ShardsRepository } from '../shards/Repository';

export type DeleteFilesInBulkResult = {
  deleted: BucketEntry['id'][];
  notDeleted: BucketEntry['id'][];
}

export class GatewayUsecase {
  constructor(
    private bucketEntriesRepository: BucketEntriesRepository,
    private framesRepository: FramesRepository,
    private shardsRepository: ShardsRepository,
    private pointersRepository: PointersRepository,
    private mirrorsRepository: MirrorsRepository,
    private contactsRepository: ContactsRepository,
    private eventBus: EventBus,
    private networkQueue: { enqueueMessage: (msg: any, cb: (err?: Error) => void) => void }
  ) {}

  async deletePointers(pointers: Pointer[]): Promise<void> {
    for (const pointer of pointers) {
      const mirrors = await this.mirrorsRepository.findByShardHashesWithContacts([ pointer.hash ]);
      const stillExistentMirrors = mirrors.filter((mirror) => {
        return mirror.contact && mirror.contact.address && mirror.contact.port;
      });

      const { hash, id } = pointer;

      for (const mirror of stillExistentMirrors) {
        const { address, port } = mirror.contact;

        const url = `http://${address}:${port}/shards/${hash}`;

        this.networkQueue.enqueueMessage({
          type: DELETING_FILE_MESSAGE,
          payload: { hash, url }
        }, (err) => {
          if (err) {
            console.error(
              'deletePointers: Error enqueueing pointer %s shard %s deletion task: %s',
              id,
              hash,
              err.message
            );
          }
        });
      }
    }

    await this.pointersRepository.deleteByIds(pointers.map(p => p.id));

    const shards = await this.shardsRepository.findByHashes(pointers.map(p => p.hash));

    for (const shard of shards) {
      for (const nodeID of Object.keys(shard.contracts)) {
        const contact = await this.contactsRepository.findById(nodeID);
        const contactExists = !!contact;

        if (contactExists) {
          const { port, address } = contact;

          const url = `http://${address}:${port}/shards/${shard.hash}`;

          this.networkQueue.enqueueMessage({
            type: DELETING_FILE_MESSAGE,
            payload: { hash: shard.hash, url }
          }, (err) => {
            if (err) {
              console.error(
                'deletePointers: Error enqueueing shard %s deletion task: %s',
                shard.hash,
                err.message
              );
            }
          });
        }
      }
    }

    await this.shardsRepository.deleteByIds(shards.map(s => s.id));
  }

  /**
   * Deletes files in bulk efficiently.
   * 
   * TODO: Probably is worth to find a way to abstract/hide the incosistency of 
   * the persistence source. Right now, the code is checking for inconsistencies,
   * which is definitely dirtier.
   * @param fileIds File ids to delete
   * @returns File ids that had been deleted succesfully
   */
  async deleteFilesInBulk(fileIds: BucketEntry['id'][]): Promise<BucketEntry['id'][]> {
    const confirmedFileIdsDeleted: BucketEntry['id'][] = [];

    try {
      const files = await this.bucketEntriesRepository.findByIdsWithFrames(fileIds);

      const nonExistentFiles = _.difference(fileIds, files.map(f => f.id));

      confirmedFileIdsDeleted.push(...nonExistentFiles);

      const filesThatDoNotHaveFrames = files.filter((file) => file.frame === undefined);
      const filesThatHaveFrames = files.filter((file) => file.frame !== undefined);
      const fileIdsWithoutFrames = filesThatDoNotHaveFrames.map(f => f.id);

      if (fileIdsWithoutFrames.length > 0) {
        await this.bucketEntriesRepository.deleteByIds(fileIdsWithoutFrames);
      }

      confirmedFileIdsDeleted.push(...fileIdsWithoutFrames);

      const pointerIds: string[] = [];

      filesThatHaveFrames.forEach((f) => {
        f.frame!.shards.forEach((p) => pointerIds.push(p));
      });
      
      if (pointerIds.length > 0) {
        const pointers = await this.pointersRepository.findByIds(pointerIds);
        const pointersFound = pointers.length > 0;

        if (pointersFound) {
          await this.deletePointers(pointers);
        } else {
          // log('Pointers not found for files %s', filesThatHaveFrames.map((f) => f.id))
        }
      }

      if (filesThatHaveFrames.length > 0) {
        await this.framesRepository.deleteByIds(filesThatHaveFrames.map(f => f.frame!.id));
        await this.bucketEntriesRepository.deleteByIds(filesThatHaveFrames.map(f => f.id));
      }

      confirmedFileIdsDeleted.push(...(filesThatHaveFrames.map(f => f.id)));
    } catch (err) {
      this.eventBus.emit(EventBusEvents.FilesBulkDeleteFailed, { err, fileIds });
    } finally {
      return confirmedFileIdsDeleted;
    }    
  }
}
