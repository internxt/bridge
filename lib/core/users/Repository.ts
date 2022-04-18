import { BasicUser, CreateUserData, User } from "./User";

export interface UsersRepository {
  findById(id: User['id']): Promise<User | null>;
  findOne(where: Partial<User>): Promise<BasicUser | null>;
  create(data: CreateUserData): Promise<BasicUser>;
  updateTotalUsedSpaceBytes(id: User['id'], totalUsedSpaceBytes: number): Promise<void>;
  updateById(id: User['id'], update: Partial<User>): any;
  removeById(id: User['id']): Promise<void>;
}
