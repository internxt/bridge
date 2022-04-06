import { User } from "../users/User";

export interface Bucket {
  id: string;
  user: User['id'];
  encryptionKey: string;
  name: string;
  status: string;
  transfer: number;
  storage: number;
}
