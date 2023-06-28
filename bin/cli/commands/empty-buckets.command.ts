import { User } from "../../../lib/core/users/User";
import { PrepareFunctionReturnType } from "../init";
import { emptyBucket } from "../tasks/empty-bucket.task";
import { emptyBuckets } from "../tasks/empty-buckets.task";
import { CommandId } from "./id";

export default {
  id: CommandId.EmptyBuckets,
  version: '0.0.1',
  fn: async (
    { usecase: { bucketsUsecase, bucketEntriesUsecase } }: PrepareFunctionReturnType,
    userId: User['id']
  ): Promise<void> => {
    const limit = 20;
  
    let offset = 0;
    let moreToDelete = true;
  
    do {
      const buckets = await bucketsUsecase.listByUserId(userId, limit, offset);

      const bucketsCount = buckets.length;
      const bucketIds = buckets.map(({ id }) => id);

      moreToDelete = bucketsCount === limit;

      await emptyBuckets(
        bucketIds, 
        (id) => emptyBucket(id, bucketEntriesUsecase), 
        async (id) => console.log(`Bucket ${id} emptied`)
      );
    } while (moreToDelete)
  }
};
