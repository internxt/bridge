import { Bucket } from "./Bucket";
import { BucketsRepository } from "./Repository";

export class MongoDBBucketsRepository implements BucketsRepository {
  constructor(private model: any) {}

  find(where: Partial<Bucket>): Promise<void> {
    return this.model.find(where);
  }

  removeAll(where: Partial<Bucket>): Promise<void> {
    return this.model.deleteMany(where);
  }
}
