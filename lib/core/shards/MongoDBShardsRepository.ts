import { ShardsRepository } from "./Repository";
import { Shard } from "./Shard";

export class MongoDBShardsRepository implements ShardsRepository {
  constructor(private model: any) {}

  findByIds(shardIds: Shard['id'][]): Promise<Shard[]> {
    return this.model.find({ _id: { $in: shardIds } }).then((shards: any) => {
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
}
