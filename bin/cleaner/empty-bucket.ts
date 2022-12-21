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

const program = require('commander');
const Config = require('../../lib/config');
const StorjStorage = require('storj-service-storage-models');
const log = require('../../lib/logger');

program.option('-b, --bucket <bucket_id>', 'Bucket to clean');
program.parse(process.argv);

console.log('Bucket to clean', program.bucket);

const config = new Config(process.env.NODE_ENV || 'develop', program.config, program.datadir);
const storage = new StorjStorage(config.storage.mongoUrl, config.storage.mongoOpts, { logger: log });

const lastFileId = "b422e6c2cf49279d10f877a9";
const {
  BucketEntry,
  BucketEntryShard,
  Bucket,
  Shard,
  Mirror,
  User,
  Frame,
  Pointer
} = storage.models;

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

function getBucketEntriesIterator(bucket?: string) {
    const where =
      lastFileId ?
        { _id: { $gte: lastFileId }, bucket } :
        { bucket };

    return BucketEntry.find(where).cursor();
}

const bucketId = '0935a9c65fa42c5e62f6ea50';

async function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
}

async function emptyBucket(): Promise<void> {
    await wait(5000);
    const iterator = getBucketEntriesIterator(bucketId);

    let file;
    let totalCount = 0;

    try {
        do {
            const fileIds: string[] = [];

            file = await iterator.next();
            for (let i = 0; i < 20; file = await iterator.next(), i++) {
                fileIds.push(file._id);
            }

            const filesIdsToRemove: string[] = [];

            for (const fileId of fileIds) {
                filesIdsToRemove.push(fileId);
            }

            const deletedFiles = await bucketEntriesUsecase.removeFiles(filesIdsToRemove);

            console.log('deleted', deletedFiles);
            
            totalCount += deletedFiles.length;
        } while (file);
    } catch (err) {
        console.error('Error emptying bucket', err);
    } finally {
        console.log('totalcount', totalCount);
        console.log("Last file was", file);
    }
}

emptyBucket().then(() => {
    console.log('Bucket emptied');
});
