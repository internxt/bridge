import { PrepareFunctionReturnType } from "../init";
import { CommandId } from "./id";
import cleanStalledBucketEntries from "../tasks/clean-stalled-bucket-entries.task";

export default {
  id: CommandId.CleanStalledBucketEntries,
  version: '0.0.1',
  fn: async (
    { 
      usecase: { bucketsUsecase, bucketEntriesUsecase }, 
      repo: { framesRepository },
      readers 
    }: PrepareFunctionReturnType,
  ): Promise<void> => {
    await cleanStalledBucketEntries(
      bucketsUsecase, 
      bucketEntriesUsecase, 
      framesRepository,
      readers.bucketEntriesReader
    );
  }
};
