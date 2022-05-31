import { Bucket } from '../buckets/Bucket';
import { Frame } from '../frames/Frame';

export interface BucketEntry {
  id: string;
  frame?: Frame['id'];
  // INCONGRUENCE HERE (filename & name): storj retrieves bucketentry and assigns name to filename (in model)
  name?: string;
  filename?: string;
  index: string;
  bucket: Bucket['id'];
  created?: Date;
  mimetype?: string;
  renewal?: Date;
  version?: number;
  size?: number;
}

export interface BucketEntryWithFrame extends Omit<BucketEntry, 'frame'> {
  frame: Frame;
}
