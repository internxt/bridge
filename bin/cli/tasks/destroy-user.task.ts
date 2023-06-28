import { UsersUsecase } from "../../../lib/core/users";
import { User } from "../../../lib/core/users/User";

export default async function destroyUser(
  userId: User['id'],
  usersUsecase: UsersUsecase,
) {
  await usersUsecase.destroyUser(userId);
}
