import { Bucket } from './Bucket';

export interface BucketsRepository {
  findOne(where: Partial<Bucket>): Promise<Bucket | null>;
  findByUser(userId: Bucket['userId'], limit: number, skip: number): Promise<Bucket[]>;
  findByIds(ids: Bucket['id'][]): Promise<Bucket[]>;
  find(where: Partial<Bucket>): Promise<Bucket[]>;
  destroyByUser(userId: Bucket['userId']): Promise<void>;
  removeAll(where: Partial<Bucket>): Promise<void>;
}
