export interface User {
  id: User['uuid'];
  resetter: string | null;
  uuid: string;
  email: string;
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
  email: string;
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

export type CreateUserData = Pick<
  User,
  'password' | 'maxSpaceBytes' | 'activated'
> & { email: string };
export type BasicUser = Pick<User, 'id' | 'uuid' | 'maxSpaceBytes'>;
