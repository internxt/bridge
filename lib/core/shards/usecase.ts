import { MirrorsRepository } from '../mirrors/Repository';
import { ShardsRepository } from './Repository';
import { PointersRepository } from '../pointers/Repository';
import NetworkMessageQueue from "../../server/queues/networkQueue";
import { DELETING_FILE_MESSAGE } from "../../server/queues/messageTypes";
import { Pointer } from "../pointers/Pointer";

export class ShardsUsecase {
  constructor(
    private shardsRepository: ShardsRepository,
    private mirrorsRepository: MirrorsRepository,
    private pointersRepository: PointersRepository,
    private networkQueue: NetworkMessageQueue
  ) {}

  async deleteShardsByIds(
    shardIds: string[],
    {
      beforePointerIsDeleted,
      version
    }: {
      beforePointerIsDeleted?: (pointer: Pointer, version: number) => Promise<void>;
      version?: number;
    } = {
      beforePointerIsDeleted: async () => {},
      version: 1
    }
  ) {
    const pointers = await this.pointersRepository.findByIds(shardIds);
    for (const pointer of pointers) {
      await beforePointerIsDeleted(pointer, version);
      await this.pointersRepository.deleteByIds([pointer.id]);
    }
  }

  async enqueueDeleteShardMessage(pointer: Pointer, version: number) {
    const { hash } = pointer;
    const mirrors = await this.mirrorsRepository.findByShardHashesWithContacts([hash]);
    const stillExistentMirrors = mirrors.filter((mirror) => {
      return mirror.contact && mirror.contact.address && mirror.contact.port;
    });

    for (const { contact, shardHash } of stillExistentMirrors) {
      const { address, port } = contact;

      let url = `http://${address}:${port}/shards/${hash}`;

      if (version === 2) {
        url = `http://${address}:${port}/v2/shards/${hash}`;
      }

      this.networkQueue.enqueueMessage({
        type: DELETING_FILE_MESSAGE,
        payload: {hash: shardHash, url}
      })
    }
  }
}
