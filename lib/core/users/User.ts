import { Bucket } from "../buckets/Bucket";

export interface User {
  id: string;
  resetter: string | null;
  uuid: string;
  password: string;
  maxSpaceBytes: number;
  deactivator: string | null;
  activator: string;
  hashpass: string;
  activated: boolean;
  isFreeTier: boolean;
  totalUsedSpaceBytes: number;
  migrated?: boolean;
  subscriptionPlan?: {
    isSubscribed?: boolean;
  };
  referralPartner?: string | null;
  preferences?: {
    dnt: boolean;
  };
  created?: Date;
  // Following attributes are deleted in toObject() from  storj-service-storage-models:
  // pendingHashPass?: string | null;
  // bytesDownloaded?: {
  //   lastMonthBytes: number;
  //   lastDayBytes: number;
  //   lastHourBytes: number;
  // };
  // bytesUploaded?: {
  //   lastMonthBytes: number;
  //   lastDayBytes: number;
  //   lastHourBytes: number;
  // };
}

export class UserDom {
  constructor(private readonly attributes: User) {}

  get<K extends keyof User>(key: K): User[K] {
    if (key in this.attributes) {
      throw new Error(`${key} not in user`);
    }
    return this.attributes[key];
  }

  owns(bucket: Bucket): boolean {
    return bucket.user === this.attributes.id;
  }

  hasSpaceFor(size: number): boolean {
    const spaceLimit = this.attributes.maxSpaceBytes;
    const usedSpace = this.attributes.totalUsedSpaceBytes;

    return spaceLimit < usedSpace + size;
  }

  get onlyUsesV2Api(): boolean {
    return this.attributes.migrated || false;
  }
}

export type CreateUserData = Pick<
  User,
  'password' | 'maxSpaceBytes' | 'activated'
> & { email: string };
export type BasicUser = Pick<User, 'id' | 'uuid' | 'maxSpaceBytes'>;
