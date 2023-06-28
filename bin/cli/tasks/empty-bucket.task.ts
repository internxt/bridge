import { BucketEntriesUsecase } from "../../../lib/core/bucketEntries/usecase";
import { BucketId } from "../../../lib/core/buckets/Bucket";

export type EmptyBucketFunctionType = (
  bucketId: BucketId,
  bucketEntriesUsecase: BucketEntriesUsecase,
) => Promise<void>;

export const emptyBucket: EmptyBucketFunctionType = async (
  bucketId,
  bucketEntriesUsecase,
): Promise<void> => {
  const limit = 20;
    
  let offset = 0;
  let moreToDelete = false;

  let howManyEntries = await bucketEntriesUsecase.countByBucket(bucketId);

  console.log(`Found ${howManyEntries} entries for bucket ${bucketId}`);

  if (howManyEntries === 0) return;

  do {
    const bucketEntries = await bucketEntriesUsecase.listByBucket(
      bucketId, 
      limit, 
      offset
    );

    const bucketEntriesCount = bucketEntries.length;
    const bucketEntriesIds = bucketEntries.map(({ id }) => id);

    moreToDelete = bucketEntriesCount === limit;

    await bucketEntriesUsecase.removeFiles(bucketEntriesIds);

    howManyEntries -= bucketEntries.length;

    console.log(`Pending ${howManyEntries} to delete`);
  } while (moreToDelete); 
}
