export interface BucketsRepository {
  removeByUserEmail(userEmail: string): Promise<void>;
}
