import { UsersRepository } from "./Repository";
import { User } from './User';

interface UserModel extends Omit<User, 'id'> {
  _id: string;
  resetter: string;
  deactivator: string;
  activator: string;
  created: Date;
  hashpass: string;
  activated: boolean;
  isFreeTier: boolean;
}

type CreateUserData = Pick<UserModel, 'password' | 'maxSpaceBytes' | 'activated'> & { id: User['id'] };
type CreatedUser = Pick<User, 'id' | 'uuid' | 'maxSpaceBytes'>;

type DatabaseUser = {
  id: string;
  email: CreatedUser['id'];
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

  async findById(id: string): Promise<Omit<User, 'password'>> {
    const { id: userId, uuid, maxSpaceBytes }: DatabaseUser = await this.userModel.findOne({ _id: id });
    
    return { id: userId, uuid, maxSpaceBytes };
  }

  findOne(where: any): any {
    return this.userModel.findOne(where);
  }

  async create(data: CreateUserData): Promise<CreatedUser> {
    const user = await new Promise((resolve: (newUser: CreatedUser) => void, reject) => {
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

  remove(where: any) {
    return this.userModel.remove(where);
  }
}
