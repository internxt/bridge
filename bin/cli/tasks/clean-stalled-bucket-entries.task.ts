import { BucketEntriesUsecase } from "../../../lib/core/bucketEntries/usecase";
import { BucketsUsecase } from "../../../lib/core/buckets/usecase";
import { FramesRepository } from "../../../lib/core/frames/Repository";
import { BucketEntriesReader } from "../../delete-objects/ObjectStorage";
import { BucketEntryDocument } from "../../delete-objects/temp-shard.model";

export type CleanStalledBucketEntriesFunctionType = (
  bucketsUsecase: BucketsUsecase,
  bucketEntriesUsecase: BucketEntriesUsecase,
  framesRepository: FramesRepository,
  reader: BucketEntriesReader,
) => Promise<void>;

const task: CleanStalledBucketEntriesFunctionType = async (
  bucketsUsecase,
  bucketEntriesUsecase,
  framesRepository,
  reader,
): Promise<void> => {
  const deleteInBulksOf = 20;
  const toDelete: BucketEntryDocument[] = [];
  const stats = {
    totalSize: 0,
    totalCount: 0,
  }

  for await (const bucketEntry of reader.list()) {
    const bucketDoesNotExist = await bucketsUsecase.findById(bucketEntry.bucket) === null;
    const isV1 = !bucketEntry.version;

    // console.log(`processing ${bucketEntry._id} is V1: ${isV1}`);
    
    if (bucketDoesNotExist && isV1) {
      toDelete.push(bucketEntry);
    }

    if (toDelete.length === deleteInBulksOf) {
      // await bucketEntriesUsecase.removeFiles(toDelete.map(be => be._id.toString()));
      const frames = await framesRepository.findByIds(toDelete.map(b => b.frame!));
      const bucketEntriesWithFrames = toDelete.map(be => ({
        ...be,
        frame: frames.find(f => f.id.toString() === be.frame?.toString()),
      }));

      stats.totalSize += frames.reduce((acc, curr) => acc + (curr.size || 0), 0);        
      stats.totalCount += toDelete.length;

      toDelete.length = 0;

      console.log(`total size ${stats.totalSize}, total count ${stats.totalCount}`);
    }
  }
}

export default task;
