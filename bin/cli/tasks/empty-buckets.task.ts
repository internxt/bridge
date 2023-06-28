import { BucketId } from "../../../lib/core/buckets/Bucket";

type EmptyBucketsFunctionType = (
  bucketsIds: BucketId[],
  emptyBucket: (id: BucketId) => Promise<void>,
  onBucketEmptied: (id: BucketId) => Promise<void>,
) => Promise<void>;

export const emptyBuckets: EmptyBucketsFunctionType = async (
  bucketsIds,
  emptyBucket,
  onBucketEmptied,
): Promise<void> => {
  for (const bucketId of bucketsIds) {
    await emptyBucket(bucketId);
    await onBucketEmptied(bucketId);
  }
}
