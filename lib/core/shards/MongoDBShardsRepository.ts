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
      contract: shard.contracts[c.nodeID],
      nodeID: c.nodeID,
    });
  });
  const formattedShard = {
    ...shard,
    contracts,
    id,
  };

  if (shard.trees) {
    formattedShard.trees = Object.values(shard.trees);
  }
  if (shard.meta) {
    formattedShard.meta = Object.values(shard.meta);
  }
  if (shard.challenges) {
    formattedShard.challenges = Object.values(shard.challenges);
  }

  return formattedShard;
};
export class MongoDBShardsRepository implements ShardsRepository {
  constructor(private model: any) {}

  findWithNoUuid(limit = 10, offset = 0): Promise<Shard[]> {
    return this.model
      .find({ uuid: { $exists: false } })
      .sort({ _id: 1 })
      .skip(offset)
      .limit(limit)
      .exec()
      .then((shards: any) => shards.map(formatFromMongoToShard));
  }

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
