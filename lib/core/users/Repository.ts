import { BasicUser, CreateUserData, User } from "./User";

export interface UsersRepository {
  findById(id: User['id']): Promise<User | null>;
  findByUuid(uuid: User['uuid']): Promise<User | null>;
  findOne(where: Partial<User>): Promise<BasicUser | null>;
  findByEmail(email: User['email']): Promise<User | null>;
  findByIds(ids: User['id'][]): Promise<User[]>;
  create(data: CreateUserData): Promise<BasicUser>;
  addTotalUsedSpaceBytes(uuid: User['uuid'], totalUsedSpaceBytes: number): Promise<void>;
  updateById(id: User['id'], update: Partial<User>): Promise<User | null>;
  updateByEmail(email: User['email'], update: Partial<User>): Promise<User | null>;
  updateByUuid(uuid: User['uuid'], update: Partial<User>): Promise<BasicUser | null>;
  removeById(id: User['id']): Promise<void>;
}
