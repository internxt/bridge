import { BucketEntriesUsecase } from "../../../lib/core/bucketEntries/usecase";
import { FramesReader } from "../../delete-objects/ObjectStorage";
import { Frame } from "../../../lib/core/frames/Frame";
import { FrameDocument } from "../../delete-objects/temp-shard.model";

export type CleanStalledFramesFunctionType = (
  bucketEntriesUsecase: BucketEntriesUsecase,
  reader: FramesReader,
) => Promise<void>;

export const cleanStalledFrames: CleanStalledFramesFunctionType = async (
  bucketEntriesUsecase,
  reader,
): Promise<void> => {
  const deleteInBulksOf = 20;
  const toDelete: { frame: Frame['id'], id: '', _frame: FrameDocument }[] = [];
  const stats = {
    totalSize: 0,
    totalCount: 0,
  }

  for await (const frame of reader.list()) {
    if (frame.bucketEntry) {
      const be = await bucketEntriesUsecase.findById(frame.bucketEntry);
      
      if (!be) {
        console.log(`deleting frame ${frame._id}, be ${frame.bucketEntry}, size ${frame.size}`);
        toDelete.push({ frame: frame._id.toString(), id: '', _frame: frame });
      }
    }
    if (toDelete.length === deleteInBulksOf) {
      await bucketEntriesUsecase.removeFilesV1(toDelete as any);

      stats.totalSize += toDelete.reduce((acc, curr) => acc + curr._frame.size, 0);        
      stats.totalCount += toDelete.length;

      toDelete.length = 0;

      console.log(`total size ${stats.totalSize}, total count ${stats.totalCount}`);
    }
  }
}
