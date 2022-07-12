export interface Contract {
  version?: number;
  farmer_id: string;
  data_size: number;
  data_hash: Shard['hash'];
  store_begin: Date;
}

export interface Shard {
  id: string;
  uuid?: string;
  hash: string;
  size: number;
  meta?: string[];
  challenges?: string[];
  trees?: string[];
  contracts: {
    nodeID: Contract['farmer_id'];
    contract: Contract;
  }[];
}

export type ShardWithPossibleMultiUpload = Pick<
  Required<Shard>,
  'hash' | 'uuid'
> & {
  UploadId?: string;
  parts?: { PartNumber: number; ETag: string }[];
};

export type ShardWithMultiUpload = Required<ShardWithPossibleMultiUpload>;
