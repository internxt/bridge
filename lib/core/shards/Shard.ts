export interface Contract {
  version?: number;
  farmer_id: string;
  data_size: number;
  data_hash: Shard['hash'];
}

export interface Shard {
  id: string;
  uuid?: string;
  hash: string;
  size: number;
  contracts: {
    nodeID: Contract['farmer_id'];
    contract: Contract
  }[]
}
