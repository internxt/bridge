import { Contact } from "../contacts/Contact";
import { Shard } from "./Shard";

export interface ShardsRepository {
  findByIds(shardIds: Shard['id'][]): Promise<Shard[]>;
  findByHashes(hashes: Shard['hash'][]): Promise<
  (Omit<Shard, 'contracts'> & { contracts: Record<Contact['id'],any> }
  )[]>
  create(data: Omit<Shard, 'id'>): Promise<Shard>;
  removeByIds(ids: Shard['id'][]): Promise<void>;
}
