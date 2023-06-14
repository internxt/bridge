import { BasicUser, CreateUserData, User, UserDom } from "./User";

export interface UsersRepository {
  findById(id: User['id']): Promise<User | null>;
  findByUuid(uuid: User['uuid']): Promise<User | null>;
  findOne(where: Partial<User>): Promise<BasicUser | null>;
  findByIds(ids: User['id'][]): Promise<User[]>;
  create(data: CreateUserData): Promise<BasicUser>;
  addTotalUsedSpaceBytes(id: User['id'], totalUsedSpaceBytes: number): Promise<void>;
  incrementTotalUsedSpaceBytes(user: UserDom, totalUsedSpaceBytes: number): Promise<void>;
  updateById(id: User['id'], update: Partial<User>): Promise<User | null>;
  updateByUuid(uuid: User['uuid'], update: Partial<User>): Promise<BasicUser | null>;
  removeById(id: User['id']): Promise<void>;
}
