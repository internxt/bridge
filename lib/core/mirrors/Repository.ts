import { Shard } from "../shards/Shard";
import { Mirror, MirrorWithContact } from "./Mirror";

export interface MirrorsRepository {
  findByShardHashesWithContacts(shardHashes: Shard['hash'][]): Promise<MirrorWithContact[]>;
  create(data: Omit<Mirror, 'id'>): Promise<Mirror>;
  deleteByIds(ids: Mirror['id'][]): Promise<void>;
}
