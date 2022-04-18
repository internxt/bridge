import { Bucket } from "./Bucket";
import { BucketsRepository } from "./Repository";

export class MongoDBBucketsRepository implements BucketsRepository {
  constructor(private model: any) {}

  find(where: Partial<Bucket>): Promise<void> {
    const query = where.id ? { ...where, _id: where.id } : where;

    delete query.id;

    return this.model.find(query);
  }

  async findOne(where: Partial<Bucket>): Promise<Bucket | null> {
    const query = where.id ? { ...where, _id: where.id } : where;

    delete query.id;

    const rawModel = await this.model.findOne(query);
    const plainObj = rawModel.toObject();

    return plainObj;
  }

  removeAll(where: Partial<Bucket>): Promise<void> {
    return this.model.deleteMany(where);
  }
}
