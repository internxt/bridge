import { User } from '../users/User';
import { Bucket } from './Bucket';

export interface BucketsRepository {
  findOne(where: Partial<Bucket>): Promise<Bucket | null>;
  findByUser(userId: User['id'], limit: number, skip: number): Promise<Bucket[]>;
  findByIds(ids: Bucket['id'][]): Promise<Bucket[]>;
  find(where: Partial<Bucket>): Promise<Bucket[]>;
  destroyByUser(userId: User['id']): Promise<void>;
  removeAll(where: Partial<Bucket>): Promise<void>;
}
