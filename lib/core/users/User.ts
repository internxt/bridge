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
  bytesDownloaded?: {
    lastMonthBytes: number;
    lastDayBytes: number;
    lastHourBytes: number;
  };
  bytesUploaded?: {
    lastMonthBytes: number;
    lastDayBytes: number;
    lastHourBytes: number;
  };
  preferences?: {
    dnt: boolean;
  };
  created?: Date;
  pendingHashPass?: string | null;
}

export type CreateUserData = Pick<
  User,
  'password' | 'maxSpaceBytes' | 'activated'
> & { email: string };
export type BasicUser = Pick<User, 'id' | 'uuid' | 'maxSpaceBytes'>;
