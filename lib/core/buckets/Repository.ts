import { Bucket } from "./Bucket";

export interface BucketsRepository {
  findOne(where: Partial<Bucket>): Promise<Bucket | null>;
  findByIds(ids: Bucket['id'][]): Promise<Bucket[]>;
  find(where: Partial<Bucket>): Promise<void>;
  removeAll(where: Partial<Bucket>): Promise<void>;
}
