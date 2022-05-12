import { Token } from "./Token";

export interface TokensRepository {
  findById(id: Token['id']): Promise<Token | null>;
}
