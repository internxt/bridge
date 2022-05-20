import { Contact } from "../contacts/Contact";
import { ShardsRepository } from "./Repository";
import { Shard } from "./Shard";

export class MongoDBShardsRepository implements ShardsRepository {
  constructor(private model: any) {}

  findByIds(shardIds: Shard['id'][]): Promise<Shard[]> {
    return this.model.find({ _id: { $in: shardIds } }).then((shards: any) => {
      return shards.map((s: any) => {
        s.id = s._id

        return s;
      });
    });
  }

  findByHashes(hashes: Shard['hash'][]): Promise<
    (Omit<Shard, 'contracts'> & { contracts: Record<Contact['id'],any> }
  )[]> {
    return this.model.find({ hash: { $in: hashes } }).then((shards: any) => {
      return shards.map((s: any) => {
        return {
          id: s._id,
          ...s.toObject()
        };
      });
    });
  }

  async create(data: Omit<Shard, "id">): Promise<Shard> {
    const rawModel = await new this.model(data).save();

    return { id: rawModel._id, ...rawModel.toObject() };
  }

  async deleteByIds(ids: string[]): Promise<void> {
    await this.model.deleteMany({ _id: { $in: ids } });
  }

  async deleteByHashes(hashes: string[]): Promise<void> {
    await this.model.deleteMany({ hash: { $in: hashes } });
  }
}
