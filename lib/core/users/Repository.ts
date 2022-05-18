import { BasicUser, CreateUserData, User } from "./User";

export interface UsersRepository {
  findById(id: User['id']): Promise<User | null>;
  findOne(where: Partial<User>): Promise<BasicUser | null>;
  findByIds(ids: User['id'][]): Promise<User[]>;
  create(data: CreateUserData): Promise<BasicUser>;
  addTotalUsedSpaceBytes(id: User['id'], totalUsedSpaceBytes: number): Promise<void>;
  updateById(id: User['id'], update: Partial<User>): any;
  removeById(id: User['id']): Promise<void>;
}
