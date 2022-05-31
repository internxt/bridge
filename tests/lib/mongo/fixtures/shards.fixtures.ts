import { ObjectId } from "mongodb";
import { Shard } from "../../../../lib/core/shards/Shard";

type MongoShardModel = Omit<Shard, "id"> & {
  _id: ObjectId;
};

const shardsTest: MongoShardModel[] = [
  {
    _id: new ObjectId("628d0178daeda9001f828b13"),
    hash: "fac3fef365682d026fa7450cd7fe8d9a42d26a16",
    uuid: "1e17404f-c89a-4956-84eb-a9dd177d698f",
    size: 33333,
    meta: [],
    challenges: [],
    trees: [],
    contracts: [
      {
        nodeID: "9a1c78a507689f6f54b847ad1cef1e614ee23f1e",
        contract: {
          data_hash: "c84794b3f43a457c645fd3e5963ed9a49f5fe382",
          store_begin: new Date("2022-05-24T16:01:58.717Z"),
          data_size: 7298260,
          farmer_id: "9a1c78a507689f6f54b847ad1cef1e614ee23f1e",
          version: 1,
        },
      },
    ],
  },
  {
    _id: new ObjectId("728d0178daeda9001f828b13"),
    hash: "dac3fef365682d026fa7450cd7fe8d9a42d26a16",
    uuid: "2e17404f-c89a-4956-84eb-a9dd177d698f",
    size: 33333,
    meta: [],
    challenges: [],
    trees: [],
    contracts: [
      {
        nodeID: "9a1c78a507689f6f54b847ad1cef1e614ee23f1e",
        contract: {
          data_hash: "c84794b3f43a457c645fd3e5963ed9a49f5fe382",
          store_begin: new Date("2022-05-24T16:01:58.717Z"),
          data_size: 7298260,
          farmer_id: "9a1c78a507689f6f54b847ad1cef1e614ee23f1e",
          version: 1,
        },
      },
    ],
  },
  {
    _id: new ObjectId("828d0178daeda9001f828b13"),
    hash: "eac3fef365682d026fa7450cd7fe8d9a42d26a16",
    uuid: "3e17404f-c89a-4956-84eb-a9dd177d698f",
    size: 33333,
    meta: [],
    challenges: [],
    trees: [],
    contracts: [
      {
        nodeID: "9a1c78a507689f6f54b847ad1cef1e614ee23f1e",
        contract: {
          data_hash: "c84794b3f43a457c645fd3e5963ed9a49f5fe382",
          store_begin: new Date("2022-05-24T16:01:58.717Z"),
          data_size: 7298260,
          farmer_id: "9a1c78a507689f6f54b847ad1cef1e614ee23f1e",
          version: 1,
        },
      },
    ],
  },
  {
    _id: new ObjectId("928d0178daeda9001f828b13"),
    hash: "bac3fef365682d026fa7450cd7fe8d9a42d26a16",
    uuid: "4e17404f-c89a-4956-84eb-a9dd177d698f",
    size: 33333,
    meta: [],
    challenges: [],
    trees: [],
    contracts: [
      {
        nodeID: "9a1c78a507689f6f54b847ad1cef1e614ee23f1e",
        contract: {
          data_hash: "c84794b3f43a457c645fd3e5963ed9a49f5fe382",
          store_begin: new Date("2022-05-24T16:01:58.717Z"),
          data_size: 7298260,
          farmer_id: "9a1c78a507689f6f54b847ad1cef1e614ee23f1e",
          version: 1,
        },
      },
    ],
  },
];

export const shards: MongoShardModel[] = shardsTest;
