import { TokensRepository } from './Repository';
import { Token } from './Token';

const formatFromMongoToToken = (mongoToken: any): Token => {
  const id = mongoToken._id.toString();
  const token = mongoToken.toObject();
  delete token.token;
  delete mongoToken._id;
  return {
    ...token,
    bucket: token.bucket.toString(),
    id,
  };
};

export class MongoDBTokensRepository implements TokensRepository {
  constructor(private model: any) {}

  async findById(id: string): Promise<Token | null> {
    const tokenModel = await this.model.findOne({ _id: id });

    if (!tokenModel) {
      return null;
    }

    return formatFromMongoToToken(tokenModel);
  }
}
