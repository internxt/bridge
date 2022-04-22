import { Contact } from "../contacts/Contact";
import { Contract, Shard } from "../shards/Shard";

export interface Mirror {
  id: string;
  shardHash: Shard['hash'];
  contact: Contact['id'];
  token: string;
  isEstablished: boolean;
  contract: Contract;
}

export interface MirrorWithContact extends Omit<Mirror, 'contact'> {
  contact: Contact
}
