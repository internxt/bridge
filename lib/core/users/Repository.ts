import { BasicUser, CreateUserData, User } from "./User";

export interface UsersRepository {
  findById(id: User['id']): Promise<BasicUser | null>;
  findOne(where: Partial<User>): Promise<BasicUser | null>;
  create(data: CreateUserData): Promise<BasicUser>;
  updateById(id: User['id'], update: Partial<User>): any;
  removeById(id: User['id']): Promise<void>;
}
