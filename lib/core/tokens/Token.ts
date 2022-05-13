import { Bucket } from "../buckets/Bucket";

export interface Token {
  id: string;
  bucket: Bucket['id'];
  operation: 'PULL' | 'PUSH';
  expires: Date;
}
