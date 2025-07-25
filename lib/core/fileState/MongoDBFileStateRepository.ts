import { Model } from 'mongoose';
import { FileState } from './FileState';
import { FileStateRepository } from './Repository';


export class MongoDBFileStateRepository implements FileStateRepository {
  constructor(private model: Model<any>) { }

  async findByBucketEntry(bucketEntry: FileState['bucketEntry']): Promise<FileState | null> {
    const fileState = await this.model.findOne({ bucketEntry });

    if (!fileState) {
      return null;
    }

    return fileState;
  }

  async setLastAccessDate(bucketEntryId: FileState['bucketEntry'], accessDate = new Date()): Promise<FileState | null> {
    return this.model.findOneAndUpdate(
      { bucketEntry: bucketEntryId },
      { $set: { lastAccessDate: accessDate } },
      { new: true, upsert: true }
    );
  }

  async deleteByBucketEntryIds(ids: FileState['bucketEntry'][]): Promise<void> {
    await this.model.deleteMany({ bucketEntry: { $in: ids } });
  }
}
