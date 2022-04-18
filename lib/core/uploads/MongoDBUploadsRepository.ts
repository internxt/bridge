import { UploadsRepository } from "./Repository";
import { Upload } from "./Upload";

export class MongoDBUploadsRepository implements UploadsRepository {
  constructor(private model: any) {}

  async findByUuids(uuids: Upload['uuid'][]): Promise<Upload[]> {
    const rawUploads = await this.model.find({ uuid: { $in: uuids } });

    return rawUploads.map((u: any) => u.toObject() as Upload);
  }

  async deleteManyByUuids(uuids: Upload['uuid'][]): Promise<void> {
    await this.model.deleteMany({ uuid: { $in: uuids } });
  }
}
