import { Bucket } from "../buckets/Bucket";
import { Frame } from "../frames/Frame";

export interface BucketEntry {
  id: string;
  frame?: Frame['id'];
  name: string;
  index: string;
  bucket: Bucket['id'];
  version?: number;
  size?: number;
}

export interface BucketEntryWithFrame extends Omit<BucketEntry, 'frame'> {
  frame: Frame;
}
