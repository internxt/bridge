import { TokensRepository } from "./Repository";
import { Token } from "./Token";

export class MongoDBTokensRepository implements TokensRepository {
  constructor(private model: any) {}

  async findById(id: string): Promise<Token | null> {
    const tokenModel = await this.model.findOne({ _id: id });

    if (!tokenModel) {
      return null;
    }

    return tokenModel.toObject() as Token;
  }
}
