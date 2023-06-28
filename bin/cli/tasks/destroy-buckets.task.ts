import { BucketId } from "../../../lib/core/buckets/Bucket";

type InjectableEmptyBuckets = (ids: BucketId[]) => Promise<void>;
type DestroyBucketsFunctionType = (
  bucketsIds: BucketId[],
  emptyBuckets: InjectableEmptyBuckets,
  destroyBuckets: (ids: BucketId[]) => Promise<void>,
) => Promise<void>;

export const destroyBuckets: DestroyBucketsFunctionType = async (
  bucketsIds,
  emptyBuckets,
  destroyBuckets,
): Promise<void> => {
  await emptyBuckets(bucketsIds);
  await destroyBuckets(bucketsIds);
}
