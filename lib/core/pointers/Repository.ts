import { Pointer } from "./Pointer";

export interface PointersRepository {
  findByIds(ids: Pointer['id'][]): Promise<Pointer[]>;
  deleteByIds(ids: Pointer['id'][]): Promise<void>;
}
