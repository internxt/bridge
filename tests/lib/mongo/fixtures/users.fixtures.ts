import { ObjectId } from "mongodb";
import { User } from "../../../../lib/core/users/User";

type MongoUserModel = Required<Omit<User, "id">> & {
  _id: string;
};

const usersTest: MongoUserModel[] = [
  {
    _id: "fff@ff.com",
    hashpass:
      "4b796e7bbe57f7092d3627d3fa7e6f645b0e50e3411e1fafd61dbf27241d836d",
    subscriptionPlan: {
      isSubscribed: false,
    },
    referralPartner: null,
    bytesDownloaded: {
      lastMonthBytes: 0,
      lastDayBytes: 0,
      lastHourBytes: 0,
    },
    bytesUploaded: {
      lastMonthBytes: 0,
      lastDayBytes: 0,
      lastHourBytes: 0,
    },
    maxSpaceBytes: 2147483648.0,
    totalUsedSpaceBytes: 14596520,
    preferences: {
      dnt: false,
    },
    isFreeTier: true,
    activated: true,
    resetter: null,
    deactivator: null,
    activator:
      "424061e79e2370266726a4792519a86a56fc5137674c4b617c0ab25f4979ea50",
    created: new Date("2022-05-24T14:18:04.078Z"),
    pendingHashPass: null,
    uuid: "569983d6-9ec5-43ae-ad87-fb3c1307d938",
    password: "xxxxx",
    migrated: false,
  },
];

export const users: MongoUserModel[] = usersTest;
