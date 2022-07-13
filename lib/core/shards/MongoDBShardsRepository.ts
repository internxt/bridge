import { Contact } from '../contacts/Contact';
import { ShardsRepository } from './Repository';
import { Shard } from './Shard';

const formatFromMongoToShard = (mongoShard: any): Shard => {
  const id = mongoShard._id.toString();
  const shard = mongoShard.toObject();
  delete shard._id;
  const contracts: any[] = [];
  mongoShard.contracts.forEach((c: any) => {
    contracts.push({
      ...shard.contracts[c.nodeID],
      nodeID: c.nodeID
    })
  });
  return {
    ...shard,
    contracts,
    id,
  };
};
export class MongoDBShardsRepository implements ShardsRepository {
  constructor(private model: any) {}

  findByIds(shardIds: Shard['id'][]): Promise<Shard[]> {
    return this.model
      .find({ _id: { $in: shardIds } })
      .then((shards: any) => shards.map(formatFromMongoToShard));
  }

  findByHashes(
    hashes: Shard['hash'][]
  ): Promise<
    (Omit<Shard, 'contracts'> & { contracts: Record<Contact['id'], any> })[]
  > {
    return this.model
      .find({ hash: { $in: hashes } })
      .then((shards: any) => shards.map(formatFromMongoToShard));
  }

  async create(data: Omit<Shard, 'id'>): Promise<Shard> {
    const rawModel = await new this.model(data).save();

    return formatFromMongoToShard(rawModel);
  }

  async deleteByIds(ids: string[]): Promise<void> {
    await this.model.deleteMany({ _id: { $in: ids } });
  }

  async deleteByHashes(hashes: string[]): Promise<void> {
    await this.model.deleteMany({ hash: { $in: hashes } });
  }
}
