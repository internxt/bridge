import { UsersRepository } from './Repository';
import { CreateUserData, User, BasicUser, UserDom } from './User';

type DatabaseUser = {
  id: string;
  email: BasicUser['id'];
  uuid: string;
  created: Date;
  activated: boolean;
  isFreeTier: boolean;
  preferences: {
    dnt: boolean;
  };
  totalUsedSpaceBytes: 0;
  maxSpaceBytes: 0;
  referralPartner: null;
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

  async findByUuid(uuid: User['uuid']): Promise<User | null> {
    const user = await this.userModel.findOne({ uuid });

    return user ? formatFromMongoToUser(user) : null;
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.userModel.findOne({ _id: id });

    if (!user) {
      return null;
    }
    return formatFromMongoToUser(user);
  }

  async findByIds(ids: string[]): Promise<User[]> {
    const users = await this.userModel.find({ _id: { $in: ids } });

    return users.map(formatFromMongoToUser);
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
    const user = await new Promise(
      (resolve: (newUser: BasicUser) => void, reject) => {
        this.userModel.create(data, (err: Error, user: DatabaseUser) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              id: user.id,
              maxSpaceBytes: user.maxSpaceBytes,
              uuid: user.uuid,
            });
          }
        });
      }
    );

    // TODO: Change storage-models to insert only, avoiding updates.
    await this.userModel.updateOne(
      {
        _id: user.id,
      },
      {
        maxSpaceBytes: data.maxSpaceBytes,
        activated: data.activated,
      }
    );

    user.maxSpaceBytes = data.maxSpaceBytes;

    return user;
  }

  async updateById(id: string, update: any): Promise<User | null> {
    await this.userModel.updateOne({ _id: id }, update);
    return this.findById(id);
  }

  async updateByUuid(uuid: string, update: Partial<User>) {
    const result = await this.userModel.updateOne({ uuid }, update);
    if (result.n === 0) {
      throw new Error('User not found');
    }
    return this.findOne({ uuid });
  }

  addTotalUsedSpaceBytes(
    id: string,
    totalUsedSpaceBytes: number
  ): Promise<void> {
    return this.userModel.updateOne(
      { _id: id },
      { $inc: { totalUsedSpaceBytes } }
    );
  }

  incrementTotalUsedSpaceBytes(user: UserDom, totalUsedSpaceBytes: number): Promise<void> {
    return this.userModel.updateOne(
      { uuid: user.get('uuid') },
      { $inc: { totalUsedSpaceBytes } }
    )
  }

  removeById(id: User['id']) {
    return this.userModel.deleteOne({ _id: id });
  }
}
