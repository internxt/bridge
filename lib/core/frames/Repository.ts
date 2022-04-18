import { Frame } from "./Frame";

export interface FramesRepository {
  findOne(where: Partial<Frame>): Promise<Frame | null>;
  removeAll(where: Partial<Frame>, limit?: number): Promise<void>;
}
