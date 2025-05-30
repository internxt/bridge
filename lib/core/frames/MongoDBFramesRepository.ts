import { Frame } from './Frame';
import { FramesRepository } from './Repository';

export const formatFromMongoToFrame = (mongoFrame: any) => {
  const id = mongoFrame.id || mongoFrame._id.toString();
  const frame = mongoFrame.toObject();
  delete frame._id;
  return {
    ...frame,
    id,
    shards: mongoFrame.shards.map((shard: any) => shard.toString()),
  };
};
export class MongoDBFramesRepository implements FramesRepository {
  constructor(private model: any) {}

  async findOne(where: Partial<Frame>): Promise<Frame | null> {
    const found = await this.model.findOne(where);
    if (!found) {
      return null;
    }
    return formatFromMongoToFrame(found);
  }

  async findByIds(ids: string[]): Promise<Frame[]> {
    const rawFrames = await this.model.find({ _id: { $in: ids } });

    return rawFrames.map(formatFromMongoToFrame);
  }

  async updateUser(oldUser: string, newUser: string): Promise<void> {
    await this.model.updateMany({ user: oldUser }, { user: newUser });    
  }

  async getUserUsage(user: Frame['user']): Promise<{ total: number } | null> {
    const cursor = await this.model
      .aggregate([
        {
          $match: {
            user,
            locked: true,
          },
        },
        {
          $group: {
            _id: '$user',
            total: { $sum: '$size' },
          },
        },
      ])
      .cursor();

      return cursor.next();
  }

  removeAll(where: Partial<Frame>): Promise<void> {
    return this.model.deleteMany(where);
  }

  deleteByIds(ids: string[]): Promise<void> {
    return this.model.deleteMany({ _id: { $in: ids } });
  }
}
