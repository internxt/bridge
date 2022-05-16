import { Frame } from "../frames/Frame";
import { BucketEntry, BucketEntryWithFrame } from "./BucketEntry";

export interface BucketEntriesRepository {
  findOne(where: Partial<BucketEntry>): Promise<BucketEntry | null>;
  findOneWithFrame(where: Partial<BucketEntry>): Promise<Omit<BucketEntryWithFrame, 'frame'> & { frame?: Frame } | null>;
  findByIdsWithFrames(ids: BucketEntry['id'][]): Promise<(Omit<BucketEntryWithFrame, 'frame'> & { frame?: Frame })[]>;
  create(data: Omit<BucketEntry, 'id'>): Promise<BucketEntry>;
  deleteByIds(ids: BucketEntry['id'][]): Promise<void>;
}
