import { UsersRepository } from "./Repository";
import { CreateUserData, User, BasicUser } from './User';

interface UserModel extends User {
  created: Date;
}

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
  }
}

export class MongoDBUsersRepository implements UsersRepository {
  constructor(private userModel: any) {}

  async findById(id: string): Promise<UserModel | null> {
    const user: UserModel = await this.userModel.findOne({ _id: id });
    
    return user;
  }

  async findByIds(ids: string[]): Promise<User[]> {
    const users = await this.userModel.findOne({ _id: { $in: ids } });
    
    return users.map((u: any) => u.toObject());
  }

  async findOne(where: Partial<User>): Promise<BasicUser | null> {
    const user: DatabaseUser = await this.userModel.findOne(where);

    return user && { 
      uuid: user.uuid, 
      id: user.id, 
      maxSpaceBytes: user.maxSpaceBytes 
    };
  }

  async create(data: CreateUserData): Promise<BasicUser> {
    const user = await new Promise((resolve: (newUser: BasicUser) => void, reject) => {
      this.userModel.create(data, (err: Error, user: DatabaseUser) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: user.id,
            maxSpaceBytes: user.maxSpaceBytes,
            uuid: user.uuid
          });
        }
      });
    });

    // TODO: Change storage-models to insert only, avoiding updates.
    await this.userModel.updateOne({ 
      _id: user.id 
    }, { 
      maxSpaceBytes: data.maxSpaceBytes,
      activated: data.activated 
    });

    user.maxSpaceBytes = data.maxSpaceBytes;

    return user;
  }

  updateById(id: string, update: any) {
    return this.userModel.updateOne({ _id: id }, update);
  }

  addTotalUsedSpaceBytes(id: string, totalUsedSpaceBytes: number): Promise<void> {
    return this.userModel.updateOne({ _id: id }, { $inc: { totalUsedSpaceBytes } });
  }

  removeById(id: User['id']) {
    return this.userModel.deleteOne({ _id: id });
  }
}
