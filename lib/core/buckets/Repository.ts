import { Bucket } from "./Bucket";

export interface BucketsRepository {
  find(where: Partial<Bucket>): Promise<void>;
  removeAll(where: Partial<Bucket>): Promise<void>;
}
