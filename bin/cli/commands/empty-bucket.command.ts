import { Bucket } from "../../../lib/core/buckets/Bucket";
import { PrepareFunctionReturnType } from "../init";
import { emptyBucket } from "../tasks/empty-bucket.task";
import { CommandId } from "./id";

export default {
  id: CommandId.EmptyBucket,
  version: '0.0.1',
  fn: async (
    { usecase: { bucketEntriesUsecase }}: PrepareFunctionReturnType,
    bucketId: Bucket['id'],
  ): Promise<void> => {  
    await emptyBucket(bucketId, bucketEntriesUsecase);
  },
};
