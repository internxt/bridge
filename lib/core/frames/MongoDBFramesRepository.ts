import { Frame } from "./Frame";
import { FramesRepository } from "./Repository";

export class MongoDBFramesRepository implements FramesRepository {
  constructor(private model: any) {}

  removeAll(where: Partial<Frame>): Promise<void> {
    return this.model.deleteMany(where);
  }
}
