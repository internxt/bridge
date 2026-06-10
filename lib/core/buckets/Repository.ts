import { Bucket } from './Bucket';

export interface BucketsRepository {
  create(bucket: Omit<Bucket, 'id'>): Promise<Bucket>;
  findOne(where: Partial<Bucket>): Promise<Bucket | null>;
  findByUser(userId: Bucket['userId'], limit: number, skip: number): Promise<Bucket[]>;
  findByIds(ids: Bucket['id'][]): Promise<Bucket[]>;
  find(where: Partial<Bucket>): Promise<Bucket[]>;
  findUserBucketsFromDate(userId: Bucket['id'], date?: Date, limit?: number): Promise<Bucket[]>;
  setUsedSpaceBytes(
    bucketId: Bucket['id'],
    userId: Bucket['userId'],
    usedSpaceBytes: number
  ): Promise<boolean>;
  sumUsedSpaceBytes(userId: Bucket['userId']): Promise<number>;
  destroyByUser(userId: Bucket['userId']): Promise<void>;
  removeAll(where: Partial<Bucket>): Promise<void>;
  removeByIdAndUser(bucketId: Bucket['id'], userId:  Bucket['userId']): Promise<void>
}
