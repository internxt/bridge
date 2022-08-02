import { Pointer } from './Pointer';
import { PointersRepository } from './Repository';

export const formatFromMongoToPointer = (mongoPointer: any): Pointer => {
  const id = mongoPointer._id.toString();
  const pointer = mongoPointer.toObject();
  delete pointer._id;
  return {
    ...pointer,
    id,
    frame: pointer.frame ? pointer.frame.toString() : null,
  };
};
export class MongoDBPointersRepository implements PointersRepository {
  constructor(private model: any) {}

  async findByIds(ids: Pointer['id'][]): Promise<Pointer[]> {
    const pointerModels = await this.model.find({ _id: { $in: ids } });

    return pointerModels.map(formatFromMongoToPointer);
  }

  async deleteByIds(ids: string[]): Promise<void> {
    await this.model.deleteMany({ _id: { $in: ids } });
  }
}
