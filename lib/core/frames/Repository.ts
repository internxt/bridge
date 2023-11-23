import { Frame } from './Frame';

export interface FramesRepository {
  findOne(where: Partial<Frame>): Promise<Frame | null>;
  findByIds(ids: Frame['id'][]): Promise<Frame[]>;
  updateUser(oldUser: Frame['user'], newUser: Frame['user']): Promise<void>;
  getUserUsage(user: Frame['user']): Promise<{ total: number } | null>;
  removeAll(where: Partial<Frame>, limit?: number): Promise<void>;
  deleteByIds(ids: Frame['id'][]): Promise<void>;
}
