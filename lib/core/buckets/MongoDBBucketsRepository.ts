import { Model } from 'mongoose';
import { Bucket } from './Bucket';
import { BucketsRepository } from './Repository';

export const formatFromMongoToBucket = (mongoBucket: any): Bucket => {
  const id = mongoBucket._id.toString();
  const bucket = mongoBucket.toObject();
  delete bucket._id;
  return {
    ...bucket,
    id,
  };
};
export class MongoDBBucketsRepository implements BucketsRepository {
  constructor(private model: any) {}

  async create(newBucketData: Omit<Bucket, 'id'>): Promise<Bucket> {
    const bucket = new this.model(newBucketData);
    const bucketCreated = await bucket.save();

    return formatFromMongoToBucket(bucketCreated);
  }

  async find(where: Partial<Bucket>): Promise<Bucket[]> {
    const query = where.id ? { ...where, _id: where.id } : where;

    delete query.id;

    const buckets = await this.model.find(query);
    return buckets.map(formatFromMongoToBucket);
  }

  async findByUser(userId: string, limit: number, skip: number): Promise<Bucket[]> {
    const buckets = await this.model.find({ userId }).skip(skip).limit(limit).exec();

    return buckets.map(formatFromMongoToBucket);
  }

  async findByIds(ids: string[]): Promise<Bucket[]> {
    const buckets = await this.model.find({ _id: { $in: ids } });

    return buckets.map(formatFromMongoToBucket);
  }

  async findOne(where: Partial<Bucket>): Promise<Bucket | null> {
    const query = where.id ? { ...where, _id: where.id } : where;

    delete query.id;

    const rawModel = await this.model.findOne(query);

    if (rawModel === null) {
      return null;
    }

    return formatFromMongoToBucket(rawModel);
  }

  async destroyByUser(userId: Bucket['userId']): Promise<void> {
    await this.model.deleteMany({
      userId,
    });
  }

  async removeByIdAndUser(bucketId: Bucket['id'], userId:  Bucket['userId']): Promise<void> {
    await this.model.deleteOne({
      userId,
      _id: bucketId
    });
  }

  async removeAll(where: Partial<Bucket>): Promise<void> {
    await this.model.deleteMany(where);
  }
}
