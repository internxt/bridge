import { BasicUser, CreateUserData, User } from "./User";

export interface UsersRepository {
  findById(id: string): Promise<BasicUser | null>;
  findOne(where: Partial<User>): Promise<BasicUser | null>;
  create(data: CreateUserData): Promise<BasicUser>;
  updateById(id: string, update: Partial<User>): any;
  remove(where: any): any;
}
