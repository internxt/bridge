import { Bucket } from "../../../lib/core/buckets/Bucket";
import { User } from "../../../lib/core/users/User";
import { PrepareFunctionReturnType } from "../init";
import { destroyBuckets } from "../tasks/destroy-buckets.task";
import { emptyBucket } from "../tasks/empty-bucket.task";
import { emptyBuckets } from "../tasks/empty-buckets.task";
import { CommandId } from "./id";

export default {
  id: CommandId.DestroyUserBuckets,
  version: '0.0.1',
  fn: async (
    { usecase: { bucketsUsecase, bucketEntriesUsecase }}: PrepareFunctionReturnType,
    userId: User['id'],
  ): Promise<void> => {
    const limit = 20;
      
    let offset = 0;
    let moreToDelete = true;
  
    do {
      const buckets = await bucketsUsecase.listByUserId(userId, limit, offset);
  
      const bucketsCount = buckets.length;
      const bucketsIds = buckets.map(({ id }) => id);
  
      moreToDelete = bucketsCount === limit;
  
      const emptyBucketsFn = async (ids: Bucket['id'][]) => {
        await emptyBuckets(
          ids, 
          (id) => emptyBucket(id, bucketEntriesUsecase), 
          async (id) => console.log(`Bucket ${id} emptied`)
        );
      };
  
      const destroyBucketsFn = () => bucketsUsecase.destroyByUser(userId);
  
      await destroyBuckets(bucketsIds, emptyBucketsFn, destroyBucketsFn);
    } while (moreToDelete);
  },
};
