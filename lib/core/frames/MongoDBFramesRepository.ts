import { User } from "../users/User";
import { Frame } from "./Frame";
import { FramesRepository } from "./Repository";

export class MongoDBFramesRepository implements FramesRepository {
  constructor(private model: any) {}

  findOne(where: Partial<Frame>): Promise<Frame | null> {
    return this.model.findOne(where);
  }

  async findByIds(ids: string[]): Promise<Frame[]> {
    const rawFrames = await this.model.find({ _id: { $in: ids } });
    
    return rawFrames.map((f: any) => f.toObject());
  }

  getUserUsage(user: User['id']): Promise<{ total: number } | null> {
    return this.model.aggregate([
      {
        $match: {
          user,
          locked: true
        }
      },
      {
        $group: {
          _id: '$user',
          total: { $sum: '$size' }
        }
      }
    ]).cursor().exec().next();
  }

  removeAll(where: Partial<Frame>): Promise<void> {
    return this.model.deleteMany(where);
  }

  deleteByIds(ids: string[]): Promise<void> {
    return this.model.deleteMany({ _id: { $in: ids } });
  }
}
