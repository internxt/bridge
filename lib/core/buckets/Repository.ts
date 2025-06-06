import { Bucket } from './Bucket';

export interface BucketsRepository {
  findOne(where: Partial<Bucket>): Promise<Bucket | null>;
  findByUser(userId: Bucket['userId'], limit: number, skip: number): Promise<Bucket[]>;
  findByIds(ids: Bucket['id'][]): Promise<Bucket[]>;
  find(where: Partial<Bucket>): Promise<Bucket[]>;
  findUserBucketsFromDate(userId: Bucket['id'], date?: Date, limit?: number): Promise<Bucket[]>;
  destroyByUser(userId: Bucket['userId']): Promise<void>;
  removeAll(where: Partial<Bucket>): Promise<void>;
  removeByIdAndUser(bucketId: Bucket['id'], userId:  Bucket['userId']): Promise<void> 
}
