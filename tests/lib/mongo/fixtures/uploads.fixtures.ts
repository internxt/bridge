import { ObjectId } from "mongodb";
import { Upload } from "../../../../lib/core/uploads/Upload";

type MongoUploadModel = Required<Omit<Upload, "id">> & {
  _id: ObjectId;
};

const uploadsTest: MongoUploadModel[] = [
  {
    _id: new ObjectId("628ced94daeda9001f828b0b"),
    uuid: "6ff31709-8087-4549-b1a2-e3293df2c6b9",
    index: "0",
    data_size: 7298260,
    contracts: [
      {
        nodeID: "9a1c78a507689f6f54b847ad1cef1e614ee23f1e",
        contract: {
          version: 1,
          farmer_id: "9a1c78a507689f6f54b847ad1cef1e614ee23f1e",
          data_size: 7298260,
          store_begin: new Date("2022-05-24T14:37:08.215Z"),
        },
      },
    ],
  },
  {
    _id: new ObjectId("628ced94daeda9001f828b0c"),
    uuid: "6ff31709-8087-4549-b1a2-e3293df2c6b8",
    index: "0",
    data_size: 7298260,
    contracts: [
      {
        nodeID: "9a1c78a507689f6f54b847ad1cef1e614ee23f1e",
        contract: {
          version: 1,
          farmer_id: "9a1c78a507689f6f54b847ad1cef1e614ee23f1e",
          data_size: 7298260,
          store_begin: new Date("2022-05-24T14:37:08.215Z"),
        },
      },
    ],
  },
];

export const uploads: MongoUploadModel[] = uploadsTest;
