import { PrepareFunctionReturnType } from '../init';
import { emptyUsersFromCsv } from '../tasks/empty-users-from-csv.task';
import { CommandId } from './id';

export default {
  id: CommandId.EmptyUsersFromCsv,
  version: '0.0.1',
  fn: async (
    { repo: { usersRepository }, usecase: { bucketsUsecase, bucketEntriesUsecase } }: PrepareFunctionReturnType,
    csvPath: string,
    concurrency: number,
  ): Promise<void> => {
    await emptyUsersFromCsv(csvPath, usersRepository, bucketsUsecase, bucketEntriesUsecase, concurrency);
  },
};
