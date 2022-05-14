import { User } from "../users/User";
import { Frame } from "./Frame";

export interface FramesRepository {
  findByIds(ids: Frame['id'][]): Promise<Frame[]>;
  findOne(where: Partial<Frame>): Promise<Frame | null>;
  getUserUsage(user: User['id']): Promise<{ total: number } | null>;
  removeAll(where: Partial<Frame>, limit?: number): Promise<void>;
  deleteByIds(ids: Frame['id'][]): Promise<void>;
}
