import NetworkMessageQueue from '../../lib/server/queues/networkQueue';
import { connectToDatabase } from "../utils/database";

import { MongoDBUsersRepository } from '../../lib/core/users/MongoDBUsersRepository'
import { MongoDBFramesRepository } from '../../lib/core/frames/MongoDBFramesRepository'
import { MongoDBMirrorsRepository } from '../../lib/core/mirrors/MongoDBMirrorsRepository'
import { MongoDBPointersRepository } from '../../lib/core/pointers/MongoDBPointersRepository'
import { MongoDBBucketsRepository } from '../../lib/core/buckets/MongoDBBucketsRepository'
import { MongoDBShardsRepository } from '../../lib/core/shards/MongoDBShardsRepository'
import { MongoDBBucketEntriesRepository } from '../../lib/core/bucketEntries/MongoDBBucketEntriesRepository'
import { MongoDBBucketEntryShardsRepository } from '../../lib/core/bucketEntryShards/MongoDBBucketEntryShardsRepository'
import { MongoDBUploadsRepository } from '../../lib/core/uploads/MongoDBUploadsRepository';
import { MongoDBTokensRepository } from '../../lib/core/tokens/MongoDBTokensRepository';
import { MongoDBContactsRepository } from '../../lib/core/contacts/MongoDBContactsRepository';

import { BucketEntriesUsecase } from '../../lib/core/bucketEntries/usecase';
import { ShardsUsecase } from '../../lib/core/shards/usecase';
import { BucketsUsecase } from '../../lib/core/buckets/usecase';

import { BucketEntriesRepository } from '../../lib/core/bucketEntries/Repository';
import { BucketEntryShardsRepository } from '../../lib/core/bucketEntryShards/Repository';
import { BucketsRepository } from '../../lib/core/buckets/Repository';
import { UsersRepository } from '../../lib/core/users/Repository';
import { FramesRepository } from '../../lib/core/frames/Repository';
import { MirrorsRepository } from '../../lib/core/mirrors/Repository';
import { PointersRepository } from '../../lib/core/pointers/Repository';
import { ShardsRepository } from '../../lib/core/shards/Repository';
import { UploadsRepository } from '../../lib/core/uploads/Repository';
import { TokensRepository } from '../../lib/core/tokens/Repository';
import { ContactsRepository } from '../../lib/core/contacts/Repository';

const Config = require('../../lib/config');

const config = new Config(process.env.NODE_ENV || 'develop', '', '');

export type PrepareFunctionReturnType = {
  repo: {
    bucketEntriesRepository: BucketEntriesRepository,
    bucketEntryShardsRepository:BucketEntryShardsRepository,
    bucketsRepository: BucketsRepository,
    usersRepository: UsersRepository,
    framesRepository: FramesRepository,
    mirrorsRepository: MirrorsRepository,
    pointersRepository: PointersRepository,
    shardsRepository: ShardsRepository,
    uploadsRepository: UploadsRepository,
    tokensRepository: TokensRepository,
    contactsRepository: ContactsRepository,
  },
  usecase: {
    bucketEntriesUsecase: BucketEntriesUsecase,
    bucketsUsecase: BucketsUsecase,
    shardsUsecase: ShardsUsecase,
  }
}

export async function prepare(): Promise<PrepareFunctionReturnType> {
  const QUEUE_NAME = 'NETWORK_WORKER_TASKS_QUEUE';

  const models = await connectToDatabase('', '');
  const { QUEUE_USERNAME, QUEUE_PASSWORD, QUEUE_HOST } = config;

  const networkQueue = new NetworkMessageQueue({
    connection: {
      url: `amqp://${QUEUE_USERNAME}:${QUEUE_PASSWORD}@${QUEUE_HOST}`,
    },
    exchange: {
      name: 'exchangeName',
      type: 'direct',
    },
    queue: {
      name: QUEUE_NAME,
    },
    routingKey: {
      name: 'routingKeyName',
    },
  });
  const bucketEntriesRepository = new MongoDBBucketEntriesRepository(models.BucketEntry);
  const bucketEntryShardsRepository = new MongoDBBucketEntryShardsRepository(models.BucketEntryShard);
  const bucketsRepository = new MongoDBBucketsRepository(models.Bucket);
  const usersRepository = new MongoDBUsersRepository(models.User);
  const framesRepository = new MongoDBFramesRepository(models.Frame);
  const mirrorsRepository = new MongoDBMirrorsRepository(models.Mirror);
  const pointersRepository = new MongoDBPointersRepository(models.Pointer);
  const shardsRepository = new MongoDBShardsRepository(models.Shard);
  const uploadsRepository = new MongoDBUploadsRepository(models.Upload);
  const tokensRepository = new MongoDBTokensRepository(models.Token);
  const contactsRepository = new MongoDBContactsRepository(models.Contact);

  const shardsUsecase = new ShardsUsecase(
    mirrorsRepository,
    networkQueue
  );
  const bucketEntriesUsecase = new BucketEntriesUsecase(
    bucketEntriesRepository,
    bucketsRepository,
    framesRepository,
    bucketEntryShardsRepository,
    shardsRepository,
    pointersRepository,
    mirrorsRepository,
    shardsUsecase,
    usersRepository
  );
  const bucketsUsecase = new BucketsUsecase(
    bucketEntryShardsRepository,
    bucketEntriesRepository,
    mirrorsRepository,
    framesRepository,
    shardsRepository,
    bucketsRepository, 
    uploadsRepository,
    usersRepository,
    tokensRepository,
    contactsRepository,
  )
  await networkQueue.connectAndRetry();

  return {
    repo: {
      bucketEntriesRepository,
      bucketEntryShardsRepository,
      bucketsRepository,
      usersRepository,
      framesRepository,
      mirrorsRepository,
      pointersRepository,
      shardsRepository,
      contactsRepository,
      tokensRepository,
      uploadsRepository
    },
    usecase: {
      bucketEntriesUsecase,
      shardsUsecase,
      bucketsUsecase
    }
  };
}
