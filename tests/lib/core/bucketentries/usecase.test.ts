import { BucketEntriesRepository } from '../../../../lib/core/bucketEntries/Repository';
import { FramesRepository } from '../../../../lib/core/frames/Repository';
import { MirrorsRepository } from '../../../../lib/core/mirrors/Repository';
import { ShardsRepository } from '../../../../lib/core/shards/Repository';
import { BucketsRepository } from '../../../../lib/core/buckets/Repository';
import { PointersRepository } from '../../../../lib/core/pointers/Repository';

import { MongoDBBucketsRepository } from '../../../../lib/core/buckets/MongoDBBucketsRepository';
import { MongoDBBucketEntriesRepository } from '../../../../lib/core/bucketEntries/MongoDBBucketEntriesRepository';
import { BucketEntriesUsecase } from '../../../../lib/core/bucketEntries/usecase';
import { BucketEntryNotFoundError, BucketForbiddenError, BucketNotFoundError } from '../../../../lib/core/buckets/usecase';
import { MongoDBFramesRepository } from '../../../../lib/core/frames/MongoDBFramesRepository';
import { MongoDBMirrorsRepository } from '../../../../lib/core/mirrors/MongoDBMirrorsRepository';
import { MongoDBPointersRepository } from '../../../../lib/core/pointers/MongoDBPointersRepository';
import { MongoDBShardsRepository } from '../../../../lib/core/shards/MongoDBShardsRepository';
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

  let networkQueue: any = {
    enqueueMessage: (message: any) => {}
  };

  let shardsUseCase = new ShardsUsecase(
    shardsRepository,
    mirrorsRepository,
    pointersRepository,
    networkQueue,
  );

  let bucketEntriesUsecase = new BucketEntriesUsecase(
    bucketEntriesRepository,
    bucketsRepository,
    framesRepository,
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
      pointersRepository,
      networkQueue,
    );

    bucketEntriesUsecase = new BucketEntriesUsecase(
      bucketEntriesRepository,
      bucketsRepository,
      framesRepository,
      shardsUseCase,
    );

    restore();
  })

  describe('validate removeFile', function () {

    it('Fails when bucket is not found', async function () {
      stub(bucketsRepository, 'findOne').resolves(null);

      try {
        await bucketEntriesUsecase.removeFile(bucketId, userEmail, fileId);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BucketNotFoundError);
      }
    });

    it('Fails when userEmail is not the same as user', async function () {
      const differentEmailBucket: any = { user: 'different@email.com' };
      stub(bucketsRepository, 'findOne').resolves(differentEmailBucket);

      try {
        await bucketEntriesUsecase.removeFile(bucketId, userEmail, fileId);
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
      stub(bucketEntriesRepository, 'findOneWithFrame').resolves(null)

      try {
        await bucketEntriesUsecase.removeFile(bucketId, userEmail, fileId);
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
        }
      }
      
      stub(bucketEntriesRepository, 'findOneWithFrame').resolves(fakeBucketEntry);
      stub(framesRepository, 'findOne').resolves(null);

      try {
        await bucketEntriesUsecase.removeFile(bucketId, userEmail, fileId);
        expect(true).toBe(false);
      } catch (err) {
        expect(deleteBucketEntriesByIds.callCount).toEqual(1);
        expect(deleteBucketEntriesByIds.firstCall.args).toStrictEqual([[fakeBucketEntry.id]]);
      }
    });

    it('removes all pointers, frame and bucketentry', async function () {
      const fakeBucketEntry: any = {
          version: 2,
          frame: {
            id: 'abc123',
          }
        }
      stub(bucketEntriesRepository, 'findOneWithFrame').resolves(fakeBucketEntry);

      const deleteFramesByIds = stub(framesRepository, 'deleteByIds');
      const deleteBucketEntriesByIds = stub(bucketEntriesRepository, 'deleteByIds');
      const deletePointersByIds = stub(pointersRepository, 'deleteByIds');

      const fakeFrame: any = {
        shards: ['shard1', 'shard2'],
      };

      stub(framesRepository, 'findOne').resolves(fakeFrame);

      const pointer1: any = { id: 'pointer1' };
      const pointer2: any = { id: 'pointer2' };
      stub(pointersRepository, 'findByIds').resolves([pointer1, pointer2]);

      const enqueueDeleteShardFunction = stub(shardsUseCase, 'enqueueDeleteShardMessage');
      try {
        await bucketEntriesUsecase.removeFile(bucketId, userEmail, fileId);

        expect(enqueueDeleteShardFunction.getCall(0).args[0]).toEqual(pointer1);
        expect(enqueueDeleteShardFunction.getCall(1).args[0]).toEqual(pointer2);
        expect(deleteFramesByIds.calledOnce).toEqual(true);
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
      stub(bucketEntriesRepository, 'findOneWithFrame').resolves(fakeBucketEntry);

      const deleteFramesByIds = stub(framesRepository, 'deleteByIds');
      const deleteBucketEntriesByIds = stub(bucketEntriesRepository, 'deleteByIds');
      const deletePointersByIds = stub(pointersRepository, 'deleteByIds');

      const fakeMirrors: any = [
        { contact: { address: 'address', port: 9000 } }
      ];
      stub(mirrorsRepository, 'findByShardHashesWithContacts').resolves(fakeMirrors);
      const fakeFrame: any = {
        shards: ['shard1'],
      };

      stub(framesRepository, 'findOne').resolves(fakeFrame);

      const pointer1: any = { id: 'pointer1', hash: 'shard1' };
      stub(pointersRepository, 'findByIds').resolves([pointer1]);

      const enqueueMessageFunction = stub(networkQueue, 'enqueueMessage');
      try {
        await bucketEntriesUsecase.removeFile(bucketId, userEmail, fileId);

        const { contact } = fakeMirrors[0];
        const { address, port } = contact;
        expect(enqueueMessageFunction.firstCall.args).toStrictEqual([
          {
            type: DELETING_FILE_MESSAGE,
            payload: {hash: pointer1.hash, url: `http://${address}:${port}/v2/shards/${pointer1.hash}`},
          }
        ]);
      } catch (err) {
        console.log(err)
        expect(true).toBe(false);
      }
    });
  });
});
