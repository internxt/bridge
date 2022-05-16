import { Frame } from "../frames/Frame";
import { BucketEntry, BucketEntryWithFrame } from "./BucketEntry";
import { BucketEntriesRepository } from "./Repository";

interface BucketEntryModel extends Omit<BucketEntry, 'id'> {
  _id: string;
  created: Date;
  renewal: Date;
  toObject(): Omit<BucketEntryModel, 'toObject'>;
}

export class MongoDBBucketEntriesRepository implements BucketEntriesRepository {
  constructor(private model: any) {}

  async findOne(where: Partial<BucketEntry>): Promise<BucketEntry | null> {
    let query: Partial<BucketEntry> & { _id?: string } = where;

    if (where.id) {
      query = { ...query, _id: where.id };
      delete query.id;
    } 
 
    const bucketEntry: BucketEntryModel | null = await this.model.findOne(query);

    return bucketEntry ? { id: bucketEntry._id, ...bucketEntry.toObject() } : bucketEntry;    
  }

  async findOneWithFrame(
    where: Partial<BucketEntry>
  ): Promise<Omit<BucketEntryWithFrame, 'frame'> & { frame?: Frame } | null> {
    let query: Partial<BucketEntry> & { _id?: string } = where;

    if (where.id) {
      query = { ...query, _id: where.id };
      delete query.id;
    } 
 
    const bucketEntry: Omit<BucketEntryModel, 'frame'> & { frame?: Frame } | null = await this.model
      .findOne(query)
      .populate('frame')
      .exec();

    let result: Omit<BucketEntryWithFrame, 'frame'> & { frame?: Frame } | null = null;

    if (bucketEntry) {
      result = { 
        ...bucketEntry.toObject(),
        id: bucketEntry._id,
        frame: bucketEntry.frame
      };
    }

    return result;    
  }

  async findByIdsWithFrames(ids: BucketEntry['id'][]): Promise<(Omit<BucketEntryWithFrame, "frame"> & { frame?: Frame | undefined; })[]> {
    const bucketEntriesModels: any[] = await this.model
      .find({ _id: { $in: ids } })
      .populate('frame')
      .exec();

    return bucketEntriesModels.map((be) => be.toObject());
  }

  async create(data: Omit<BucketEntry, "id">): Promise<BucketEntry> {
    const rawModel = await new this.model({ ...data, created: new Date() }).save();

    return rawModel.toObject();
  }

  async deleteByIds(ids: BucketEntry['id'][]): Promise<void> {
    await this.model.deleteMany({ _id: { $in: ids } });
  }
}
