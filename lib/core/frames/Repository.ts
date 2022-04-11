import { Frame } from "./Frame";

export interface FramesRepository {
  removeAll(where: Partial<Frame>, limit?: number): Promise<void>;
}
