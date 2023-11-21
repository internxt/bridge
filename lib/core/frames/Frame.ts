import { User } from '../users/User';

export interface Frame {
  id: string;
  user: User['email'];
  shards: string[];
  storageSize: number;
  size: number;
  locked: boolean;
  bucketEntry?: string;
  created: Date;
}
