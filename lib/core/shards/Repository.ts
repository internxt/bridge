import { Shard } from "./Shard";

export interface ShardsRepository {
  findByIds(shardIds: Shard['id'][]): Promise<Shard[]>;
  create(data: Omit<Shard, 'id'>): Promise<Shard>;
}
