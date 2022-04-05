import { BucketsRepository } from "./Repository";

export class MongoDBBucketsRepository implements BucketsRepository {
  constructor(private model: any) {}

  async removeByUserEmail(userEmail: string) {
    await this.model.remove({ user: userEmail });
  }
}
