import { PrepareFunctionReturnType } from "../init";
import { cleanStalledFrames } from "../tasks/clean-stalled-frames.task";
import { CommandId } from "./id";

export default {
  id: CommandId.CleanStalledFrames,
  version: '0.0.1',
  fn: async (
    { usecase: { bucketEntriesUsecase }, readers }: PrepareFunctionReturnType,
  ): Promise<void> => {  
    await cleanStalledFrames(bucketEntriesUsecase, readers.framesReader);
  },
};
