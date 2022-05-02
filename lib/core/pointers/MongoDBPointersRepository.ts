import { Pointer } from "./Pointer";
import { PointersRepository } from "./Repository";

export class MongoDBPointersRepository implements PointersRepository {
  constructor(private model: any) {}
  
  async findByIds(ids: Pointer['id'][]): Promise<Pointer[]> {
    const pointerModels = await this.model.find({ _id: { $in: ids } });

    return pointerModels.map((p: any) => p.toObject() as Pointer);
  }

  async deleteByIds(ids: string[]): Promise<void> {
    await this.model.deleteMany({ _id: { $in: ids } })
  }
}
