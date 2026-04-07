import { UsersRepository } from './Repository';
import { CreateUserData, User, BasicUser } from './User';

type DatabaseUser = {
  id: DatabaseUser['uuid'];
  email: string;
  uuid: string;
  created: Date;
  activated: boolean;
  isFreeTier: boolean;
  preferences: {
    dnt: boolean;
  };
  totalUsedSpaceBytes: 0;
  maxSpaceBytes: 0;
  subscriptionPlan: {
    isSubscribed: boolean;
  };
};
export const formatFromMongoToUser = (mongoUser: any): User => {
  const id = mongoUser._id;
  const user = mongoUser.toObject();
  delete user._id;
  return {
    ...user,
    id,
  };
};

export class MongoDBUsersRepository implements UsersRepository {
  constructor(private userModel: any) {}

  async findById(id: string): Promise<User | null> {
    const user = await this.userModel.findOne({ _id: id });

    if (!user) {
      return null;
    }
    return formatFromMongoToUser(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.userModel.findOne({ email });

    return user ? formatFromMongoToUser(user) : null;
  }

  async findByIds(ids: string[]): Promise<User[]> {
    const users = await this.userModel.find({ _id: { $in: ids } });

    return users.map(formatFromMongoToUser);
  }

  async findByUuid(uuid: string): Promise<User | null> {
    const user = await this.userModel.findOne({ uuid });

    return user ? formatFromMongoToUser(user) : null;
  }

  async findOne(where: Partial<User>): Promise<BasicUser | null> {
    const user: DatabaseUser = await this.userModel.findOne(where);

    return (
      user && {
        uuid: user.uuid,
        id: user.id,
        maxSpaceBytes: user.maxSpaceBytes,
      }
    );
  }

  async create(data: CreateUserData): Promise<BasicUser> {
    const createdUser = await this.userModel.create(data);

    // TODO: Change storage-models to insert only, avoiding updates.
    await this.userModel.updateOne(
      { _id: createdUser.id },
      {
        maxSpaceBytes: data.maxSpaceBytes,
        activated: data.activated,
      }
    );

    createdUser.maxSpaceBytes = data.maxSpaceBytes;

    return createdUser;
  }

  async updateById(id: string, update: any): Promise<User | null> {
    await this.userModel.updateOne({ _id: id }, update);
    return this.findById(id);
  }

  async updateByEmail(email: string, update: Partial<User>): Promise<User | null> {
    await this.userModel.updateOne({ email }, update);
    return this.findByEmail(email);
  }

  async updateByUuid(uuid: string, update: Partial<User>) {
    await this.userModel.updateOne({ uuid }, { $set: update });
  }

  addTotalUsedSpaceBytes(
    uuid: string,
    totalUsedSpaceBytes: number
  ): Promise<void> {
    return this.userModel.updateOne(
      { uuid },
      { $inc: { totalUsedSpaceBytes } }
    );
  }

  removeById(id: User['id']) {
    return this.userModel.deleteOne({ _id: id });
  }
}
