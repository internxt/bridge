import { Contract, Shard } from '../shards/Shard';

export interface Upload {
  id: string;
  index: string;
  uuid: Required<Shard>['uuid'];
  data_size: Contract['data_size'];
  contracts: {
    nodeID: Contract['farmer_id'];
    contract: Omit<Contract, 'data_hash'>;
  }[];
}
