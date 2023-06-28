import { User } from '../users/User';

export type BucketId = string;

export interface Bucket {
  id: BucketId;
  user: User['id'];
  encryptionKey: string;
  name: string;
  status: string;
  transfer: number;
  storage: number;
  created?: Date;
  maxFrameSize?: number;
  publicPermissions?: string[];
  pubkeys?: string[];
}
