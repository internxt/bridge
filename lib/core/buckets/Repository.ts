import { Bucket } from "./Bucket";

export interface BucketsRepository {
  findOne(where: Partial<Bucket>): Promise<Bucket | null>;
  find(where: Partial<Bucket>): Promise<void>;
  removeAll(where: Partial<Bucket>): Promise<void>;
}
