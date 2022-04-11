import { User } from "../users/User";

export interface Frame {
  id: string;
  user: User['id'];
  shards: any[];
  storageSize: number;
  size: number;
  locked: boolean;
}
