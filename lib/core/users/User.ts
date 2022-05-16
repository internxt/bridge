export interface User {
  id: string;
  resetter: string | null;
  uuid: string;
  password: string;
  maxSpaceBytes: number;
  deactivator: string;
  activator: string;
  hashpass: string;
  activated: boolean;
  isFreeTier: boolean;
  totalUsedSpaceBytes: number;
  migrated?: boolean
}

export type CreateUserData = Pick<User, 'password' | 'maxSpaceBytes' | 'activated'> & { email: string };
export type BasicUser = Pick<User, 'id' | 'uuid' | 'maxSpaceBytes'>;
