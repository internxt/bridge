#!/usr/bin/env node
import { MongoDBBucketEntriesRepository } from '../../lib/core/bucketEntries/MongoDBBucketEntriesRepository';
import { MongoDBBucketEntryShardsRepository } from '../../lib/core/bucketEntryShards/MongoDBBucketEntryShardsRepository';
import { MongoDBBucketsRepository } from '../../lib/core/buckets/MongoDBBucketsRepository';
import { MongoDBUsersRepository } from '../../lib/core/users/MongoDBUsersRepository';
import { MongoDBFramesRepository } from '../../lib/core/frames/MongoDBFramesRepository';
import { MongoDBMirrorsRepository } from '../../lib/core/mirrors/MongoDBMirrorsRepository';
import { MongoDBPointersRepository } from '../../lib/core/pointers/MongoDBPointersRepository';
import { MongoDBShardsRepository } from '../../lib/core/shards/MongoDBShardsRepository';

import { BucketEntriesRepository } from '../../lib/core/bucketEntries/Repository';
import { BucketEntryShardsRepository } from '../../lib/core/bucketEntryShards/Repository';
import { BucketsRepository } from '../../lib/core/buckets/Repository';
import { UsersRepository } from '../../lib/core/users/Repository';
import { FramesRepository } from '../../lib/core/frames/Repository';
import { MirrorsRepository } from '../../lib/core/mirrors/Repository';
import { PointersRepository } from '../../lib/core/pointers/Repository';
import { ShardsRepository } from '../../lib/core/shards/Repository';

import { ShardsUsecase } from '../../lib/core/shards/usecase';
import { BucketEntriesUsecase } from '../../lib/core/bucketEntries/usecase';

import NetworkMessageQueue from '../../lib/server/queues/networkQueue';

export default function buildRemoveFiles(config: any, models: Record<string, any>): (fileIds: string[]) => Promise<string[]> {
    const { Bucket, BucketEntry, BucketEntryShard, Frame, Mirror, Pointer, Shard, User } = models;
    const QUEUE_NAME = 'NETWORK_WORKER_TASKS_QUEUE';
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

    const bucketEntriesRepository: BucketEntriesRepository = new MongoDBBucketEntriesRepository(BucketEntry);
    const bucketEntryShardsRepository: BucketEntryShardsRepository = new MongoDBBucketEntryShardsRepository(BucketEntryShard);
    const bucketsRepository: BucketsRepository = new MongoDBBucketsRepository(Bucket);
    const usersRepository: UsersRepository = new MongoDBUsersRepository(User);
    const framesRepository: FramesRepository = new MongoDBFramesRepository(Frame);
    const mirrorsRepository: MirrorsRepository = new MongoDBMirrorsRepository(Mirror);
    const pointersRepository: PointersRepository = new MongoDBPointersRepository(Pointer);
    const shardsRepository: ShardsRepository = new MongoDBShardsRepository(Shard);
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

    return (fileIds: string[]) => bucketEntriesUsecase.removeFiles(fileIds);
} 
