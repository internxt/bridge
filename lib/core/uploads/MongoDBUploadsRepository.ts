import { UploadsRepository } from './Repository';
import { Upload } from './Upload';

const formatFromMongoToUpload = (mongoUpload: any): Upload => {
  const id = mongoUpload._id.toString();
  const upload = mongoUpload.toObject();
  delete upload._id;
  return {
    ...upload,
    id,
  };
};

export class MongoDBUploadsRepository implements UploadsRepository {
  constructor(private model: any) {}

  async findByUuids(uuids: Upload['uuid'][]): Promise<Upload[]> {
    const rawUploads = await this.model.find({ uuid: { $in: uuids } });

    return rawUploads.map(formatFromMongoToUpload);
  }

  async deleteManyByUuids(uuids: Upload['uuid'][]): Promise<void> {
    await this.model.deleteMany({ uuid: { $in: uuids } });
  }
}
