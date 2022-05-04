import { Frame } from "./Frame";
import { FramesRepository } from "./Repository";

export class MongoDBFramesRepository implements FramesRepository {
  constructor(private model: any) {}

  findOne(where: Partial<Frame>): Promise<Frame | null> {
    return this.model.findOne(where);
  }

  removeAll(where: Partial<Frame>): Promise<void> {
    return this.model.deleteMany(where);
  }

  deleteByIds(ids: string[]): Promise<void> {
    return this.model.deleteMany({ _id: { $in: ids } });
  }
}
