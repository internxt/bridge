import { Bucket } from "../buckets/Bucket";
import { Frame } from "../frames/Frame";
import { BucketEntry, BucketEntryWithFrame } from "./BucketEntry";

export interface BucketEntriesSummary {
  shardBackedCount: number;
  metadataOnlyBytes: number;
}

export interface BucketEntriesRepository {
  count(where: Partial<BucketEntry>): Promise<number>;
  findOne(where: Partial<BucketEntry>): Promise<BucketEntry | null>;
  findByBucket(bucketId: Bucket['id'], limit: number, offset: number): Promise<BucketEntry[]>;
  hasEntriesByBucket(bucketId: Bucket['id']): Promise<boolean>;
  hasShardBackedEntriesByBucket(bucketId: Bucket['id']): Promise<boolean>;
  summarizeByBucket(bucketId: Bucket['id']): Promise<BucketEntriesSummary>;
  deleteMetadataOnlyByBucket(bucketId: Bucket['id']): Promise<void>;
  findByIds(ids: BucketEntry['id'][]): Promise<BucketEntry[]>;
  findOneWithFrame(where: Partial<BucketEntry>): Promise<Omit<BucketEntryWithFrame, 'frame'> & { frame?: Frame } | null>;
  findByIdsWithFrames(ids: BucketEntry['id'][]): Promise<(Omit<BucketEntryWithFrame, 'frame'> & { frame?: Frame })[]>;
  create(data: Omit<BucketEntry, 'id'>): Promise<BucketEntry>;
  deleteByIds(ids: BucketEntry['id'][]): Promise<void>;
}
