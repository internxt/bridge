import fs from 'fs';
import readline from 'readline';
import { BucketEntriesUsecase } from '../../../lib/core/bucketEntries/usecase';
import { BucketsUsecase } from '../../../lib/core/buckets/usecase';
import { UsersRepository } from '../../../lib/core/users/Repository';
import { emptyBucket } from './empty-bucket.task';
import { emptyBuckets } from './empty-buckets.task';

const emptyUserBuckets = async (
  email: string,
  usersRepository: UsersRepository,
  bucketsUsecase: BucketsUsecase,
  bucketEntriesUsecase: BucketEntriesUsecase,
): Promise<void> => {
  const user = await usersRepository.findByEmail(email);

  if (!user) {
    console.log(`User not found: ${email}`);
    return;
  }

  console.log(`Emptying buckets for user ${email} (${user.id})`);

  const limit = 20;
  let offset = 0;
  let moreToProcess = true;

  do {
    const buckets = await bucketsUsecase.listByUserId(user.id, limit, offset);

    moreToProcess = buckets.length === limit;
    offset += buckets.length;

    await emptyBuckets(
      buckets.map(({ id }) => id),
      (id) => emptyBucket(id, bucketEntriesUsecase),
      async (id) => console.log(`  Bucket ${id} emptied`),
    );
  } while (moreToProcess);

  console.log(`Done with user ${email}`);
};

export const emptyUsersFromCsv = async (
  csvPath: string,
  usersRepository: UsersRepository,
  bucketsUsecase: BucketsUsecase,
  bucketEntriesUsecase: BucketEntriesUsecase,
  concurrency = 3,
): Promise<void> => {
  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const emails: string[] = [];
  for await (const line of rl) {
    const email = line.trim();
    if (email && email.includes('@')) emails.push(email);
  }

  console.log(`Processing ${emails.length} users with concurrency ${concurrency}`);

  let index = 0;

  const worker = async (): Promise<void> => {
    while (index < emails.length) {
      const email = emails[index++];
      await emptyUserBuckets(email, usersRepository, bucketsUsecase, bucketEntriesUsecase);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
};
