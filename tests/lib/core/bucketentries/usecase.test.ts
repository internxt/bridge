import { BucketEntriesRepository } from '../../../../lib/core/bucketEntries/Repository';
import { FramesRepository } from '../../../../lib/core/frames/Repository';
import { MirrorsRepository } from '../../../../lib/core/mirrors/Repository';
import { ShardsRepository } from '../../../../lib/core/shards/Repository';
import { BucketsRepository } from '../../../../lib/core/buckets/Repository';
import { PointersRepository } from '../../../../lib/core/pointers/Repository';
import { BucketEntryShardsRepository } from '../../../../lib/core/bucketEntryShards/Repository';

import { MongoDBBucketsRepository } from '../../../../lib/core/buckets/MongoDBBucketsRepository';
import { MongoDBBucketEntriesRepository } from '../../../../lib/core/bucketEntries/MongoDBBucketEntriesRepository';
import { BucketEntriesUsecase } from '../../../../lib/core/bucketEntries/usecase';
import { BucketEntryNotFoundError, BucketForbiddenError, BucketNotFoundError } from '../../../../lib/core/buckets/usecase';
import { MongoDBFramesRepository } from '../../../../lib/core/frames/MongoDBFramesRepository';
import { MongoDBMirrorsRepository } from '../../../../lib/core/mirrors/MongoDBMirrorsRepository';
import { MongoDBPointersRepository } from '../../../../lib/core/pointers/MongoDBPointersRepository';
import { MongoDBShardsRepository } from '../../../../lib/core/shards/MongoDBShardsRepository';
import { MongoDBBucketEntryShardsRepository } from '../../../../lib/core/bucketEntryShards/MongoDBBucketEntryShardsRepository';
import { ShardsUsecase } from '../../../../lib/core/shards/usecase';
import { restore, stub } from 'sinon';
import { DELETING_FILE_MESSAGE } from '../../../../lib/server/queues/messageTypes';

describe('BucketEntriesUsecase', function () {

  const bucketId =  'bucketIdSAMPLE';
  const userEmail =  'sample@sample.com';
  const fileId =  'abc123';

  let bucketEntriesRepository: BucketEntriesRepository = new MongoDBBucketEntriesRepository({});
  let mirrorsRepository: MirrorsRepository = new MongoDBMirrorsRepository({});
  let framesRepository: FramesRepository = new MongoDBFramesRepository({});
  let shardsRepository: ShardsRepository = new MongoDBShardsRepository({});
  let bucketsRepository: BucketsRepository = new MongoDBBucketsRepository({});
  let pointersRepository: PointersRepository = new MongoDBPointersRepository({});
  let bucketEntryShardsRepository: BucketEntryShardsRepository = new MongoDBBucketEntryShardsRepository({});

  let networkQueue: any = {
    enqueueMessage: (message: any) => {}
  };

  let shardsUseCase = new ShardsUsecase(
    shardsRepository,
    mirrorsRepository,
    networkQueue,
  );

  let bucketEntriesUsecase = new BucketEntriesUsecase(
    bucketEntriesRepository,
    bucketsRepository,
    framesRepository,
    bucketEntryShardsRepository,
    shardsRepository,
    pointersRepository,
    shardsUseCase,
  );
  
  beforeEach(() => {
    bucketEntriesRepository = new MongoDBBucketEntriesRepository({});
    mirrorsRepository = new MongoDBMirrorsRepository({});
    framesRepository = new MongoDBFramesRepository({});
    shardsRepository = new MongoDBShardsRepository({});
    bucketsRepository = new MongoDBBucketsRepository({});
    pointersRepository = new MongoDBPointersRepository({});

    shardsUseCase = new ShardsUsecase(
      shardsRepository,
      mirrorsRepository,
      networkQueue,
    );

    bucketEntriesUsecase = new BucketEntriesUsecase(
      bucketEntriesRepository,
      bucketsRepository,
      framesRepository,
      bucketEntryShardsRepository,
      shardsRepository,
      pointersRepository,
      shardsUseCase,
    );

    restore();
  })

  describe('validate removeFile', function () {

    it('Fails when bucket is not found', async function () {
      stub(bucketsRepository, 'findOne').resolves(null);

      try {
        await bucketEntriesUsecase.removeFileAndValidateBucketExists(bucketId, fileId);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BucketNotFoundError);
      }
    });

    it('Fails when userEmail is not the same as user', async function () {
      const differentEmailBucket: any = { user: 'different@email.com' };
      stub(bucketsRepository, 'findOne').resolves(differentEmailBucket);

      try {
        await bucketEntriesUsecase.removeFileFromUser(bucketId, fileId, userEmail);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BucketForbiddenError);
      }
    });
  });

  describe('removeFile functionality', function () {
    beforeEach(() => {
      const standardBucket: any = {
        user: userEmail,
        _id: bucketId
      };
      stub(bucketsRepository, 'findOne').resolves(standardBucket);
    });

    it('Fails when file is not found', async function () {
      stub(bucketEntriesRepository, 'findOne').resolves(null)

      try {
        await bucketEntriesUsecase.removeFile(fileId);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BucketEntryNotFoundError);
      }
    });

    it('Removes the bucketEntry when there is no frame', async function () {
      const deleteBucketEntriesByIds = stub(bucketEntriesRepository, 'deleteByIds');
      const fakeBucketEntry: any = {
        id: 'id_of_bucket_entry',
        frame: {
          id: 'abc123'
        },
        version: 1
      }
      
      stub(bucketEntriesRepository, 'findOne').resolves(fakeBucketEntry);
      stub(framesRepository, 'findOne').resolves(null);

      try {
        await bucketEntriesUsecase.removeFile(fileId);
        expect(true).toBe(false);
      } catch (err) {
        expect(deleteBucketEntriesByIds.callCount).toEqual(1);
        expect(deleteBucketEntriesByIds.firstCall.args).toStrictEqual([[fakeBucketEntry.id]]);
      }
    });

    it('removes all pointers, frame and bucketentry, version 1', async function () {
      const fakeBucketEntry: any = {
          version: 1,
          frame: {
            id: 'abc123',
          }
        }
      stub(bucketEntriesRepository, 'findOne').resolves(fakeBucketEntry);

      const deleteFramesByIds = stub(framesRepository, 'deleteByIds');
      const deleteBucketEntriesByIds = stub(bucketEntriesRepository, 'deleteByIds');
      const deletePointersByIds = stub(pointersRepository, 'deleteByIds');

      const fakeFrame: any = {
        shards: ['id_shard1', 'id_shard2'],
      };

      stub(framesRepository, 'findOne').resolves(fakeFrame);

      const pointer1: any = { id: 'id_shard1' };
      const pointer2: any = { id: 'id_shard2' };
      stub(pointersRepository, 'findByIds').resolves([pointer1, pointer2]);

      const shard1: any = { hash: 'shard1' };
      const shard2: any = { hash: 'shard2' };
      stub(shardsRepository, 'findByIds').resolves([shard1, shard2]);

      const enqueueDeleteShardFunction = stub(shardsUseCase, 'enqueueDeleteShardMessages');
      try {
        await bucketEntriesUsecase.removeFile(fileId);

        expect(enqueueDeleteShardFunction.getCall(0).args[0]).toEqual([shard1.hash, shard2.hash]);
        expect(enqueueDeleteShardFunction.getCall(0).args[1]).toEqual(1);
        expect(deletePointersByIds.getCall(0).args[0]).toEqual([pointer1.id, pointer2.id]);
        expect(deleteFramesByIds.calledOnce).toEqual(true);
        expect(deleteBucketEntriesByIds.calledOnce).toEqual(true);
      } catch (err) {
        expect(true).toBe(false);
      }
    });

    it('removes all pointers, frame and bucketentry, version 2', async function () {
      const fakeBucketEntry: any = {
          version: 2,
          frame: {
            id: 'abc123',
          }
        }
      stub(bucketEntriesRepository, 'findOne').resolves(fakeBucketEntry);

      const fakeBucketEntryShards: any = [
        { shard: 'shard1'}, { shard: 'shard2'}
      ];

      stub(bucketEntryShardsRepository, 'findByBucketEntry').resolves(fakeBucketEntryShards);

      const deleteBucketEntriesByIds = stub(bucketEntriesRepository, 'deleteByIds');

      const shard1: any = { hash: 'shard1' };
      const shard2: any = { hash: 'shard2' };
      stub(shardsRepository, 'findByIds').resolves([shard1, shard2]);

      const enqueueDeleteShardFunction = stub(shardsUseCase, 'enqueueDeleteShardMessages');
      try {
        await bucketEntriesUsecase.removeFile(fileId);

        expect(enqueueDeleteShardFunction.getCall(0).args[0]).toEqual([shard1.hash, shard2.hash]);
        expect(enqueueDeleteShardFunction.getCall(0).args[1]).toEqual(2);
        expect(deleteBucketEntriesByIds.calledOnce).toEqual(true);
      } catch (err) {
        expect(true).toBe(false);
      }
    });

    it('enqueues using correct url', async function () {
      const fakeBucketEntry: any = {
          version: 2,
          frame: {
            id: 'abc123',
          }
        }
      stub(bucketEntriesRepository, 'findOne').resolves(fakeBucketEntry);

      const deleteBucketEntriesByIds = stub(bucketEntriesRepository, 'deleteByIds');
      const fakeBucketEntryShards: any = [
        { shard: 'shard1'}, { shard: 'shard2'}
      ];

      stub(bucketEntryShardsRepository, 'findByBucketEntry').resolves(fakeBucketEntryShards);

      const shard1: any = { hash: 'shard1' };
      const shard2: any = { hash: 'shard2' };
      stub(shardsRepository, 'findByIds').resolves([shard1, shard2]);

      const fakeMirrors: any = [
        { contact: { address: 'address', port: 9000 } }
      ];
      stub(mirrorsRepository, 'findByShardHashesWithContacts').resolves(fakeMirrors);

      const enqueueMessageFunction = stub(networkQueue, 'enqueueMessage');
      try {
        await bucketEntriesUsecase.removeFile(fileId);

        const { contact } = fakeMirrors[0];
        const { address, port } = contact;
        expect(enqueueMessageFunction.firstCall.args).toStrictEqual([
          {
            type: DELETING_FILE_MESSAGE,
            payload: {hash: shard1.hash, url: `http://${address}:${port}/v2/shards/${shard1.hash}`},
          }
        ]);
      } catch (err) {
        expect(true).toBe(false);
      }
    });
  });
});
