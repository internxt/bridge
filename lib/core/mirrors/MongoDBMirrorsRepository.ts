import { Mirror, MirrorWithContact } from "./Mirror";
import { MirrorsRepository } from "./Repository";

export class MongoDBMirrorsRepository implements MirrorsRepository {
  constructor(private model: any) {}

  findByShardHashesWithContacts(shardHashes: string[]): Promise<MirrorWithContact[]> {
    return this.model
      .find({ shardHash: { $in: shardHashes } })
      .populate('contact')
      .exec()
      .then((mirrors: any) => {
        return mirrors.map((m: any) => {
          return {
            id: m._id,
            ...m.toObject()
          };
        });
      });
  }

  findByShardUuidsWithContacts(uuids: string[]): Promise<MirrorWithContact[]> {
    return this.model
      .find({ uuid: { $in: uuids } })
      .populate('contact')
      .exec()
      .then((mirrors: any) => {
        return mirrors.map((m: any) => {
          return {
            id: m._id,
            ...m.toObject()
          };
        });
      });
  }

  async create(data: Omit<Mirror, "id">): Promise<Mirror> {
    const rawModel = await new this.model({ ...data, created: new Date() }).save();
  
    return rawModel.toObject();
  }

  deleteByIds(ids: string[]): Promise<void> {
    return this.model.deleteMany({ _id: { $in: ids } }).exec();
  }
  
  async insertMany(data: Omit<Mirror, 'id'>[]): Promise<void> {
    await this.model.insertMany(data);
  }
}
