import { Bucket } from './Bucket';
import { BucketsRepository } from './Repository';

export class MongoDBBucketsRepository implements BucketsRepository {
  constructor(private model: any) {}

  async find(where: Partial<Bucket>): Promise<Bucket[]> {
    const query = where.id ? { ...where, _id: where.id } : where;

    delete query.id;

    const buckets = await this.model.find(query);
    return buckets.map((b: any) => ({ ...b.toObject(), id: b._id.toString() }));
  }

  async findByIds(ids: string[]): Promise<Bucket[]> {
    const buckets = await this.model.find({ _id: { $in: ids } });

    return buckets.map((b: any) => ({ ...b.toObject(), id: b._id.toString() }));
  }

  async findOne(where: Partial<Bucket>): Promise<Bucket | null> {
    const query = where.id ? { ...where, _id: where.id } : where;

    delete query.id;

    const rawModel = await this.model.findOne(query);

    if (rawModel === null) {
      return null;
    }

    const plainObj = rawModel.toObject();
    plainObj.id = plainObj.id.toString();

    return plainObj;
  }

  removeAll(where: Partial<Bucket>): Promise<void> {
    const query = where.id ? { ...where, _id: where.id } : where;
    return this.model.deleteMany(query);
  }
}
