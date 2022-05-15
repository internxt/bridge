import { restore, stub } from 'sinon';

import { BucketEntriesRepository } from '../../../../lib/core/bucketEntries/Repository';
import { FramesRepository } from '../../../../lib/core/frames/Repository';
import { MirrorsRepository } from '../../../../lib/core/mirrors/Repository';
import { ShardsRepository } from '../../../../lib/core/shards/Repository';
import { BucketsRepository } from '../../../../lib/core/buckets/Repository';
import { PointersRepository } from '../../../../lib/core/pointers/Repository';
import { BucketEntryShardsRepository } from '../../../../lib/core/bucketEntryShards/Repository';
import { UsersRepository } from '../../../../lib/core/users/Repository';

import { MongoDBBucketsRepository } from '../../../../lib/core/buckets/MongoDBBucketsRepository';
import { MongoDBBucketEntriesRepository } from '../../../../lib/core/bucketEntries/MongoDBBucketEntriesRepository';
import { BucketEntriesUsecase, BucketEntryVersionNotFoundError } from '../../../../lib/core/bucketEntries/usecase';
import { BucketEntryNotFoundError, BucketForbiddenError, BucketNotFoundError } from '../../../../lib/core/buckets/usecase';
import { MongoDBFramesRepository } from '../../../../lib/core/frames/MongoDBFramesRepository';
import { MongoDBMirrorsRepository } from '../../../../lib/core/mirrors/MongoDBMirrorsRepository';
import { MongoDBPointersRepository } from '../../../../lib/core/pointers/MongoDBPointersRepository';
import { MongoDBShardsRepository } from '../../../../lib/core/shards/MongoDBShardsRepository';
import { MongoDBBucketEntryShardsRepository } from '../../../../lib/core/bucketEntryShards/MongoDBBucketEntryShardsRepository';
import { MongoDBUsersRepository } from '../../../../lib/core/users';
import { ShardsUsecase } from '../../../../lib/core/shards/usecase';
import { DELETING_FILE_MESSAGE } from '../../../../lib/server/queues/messageTypes';

import fixtures from './fixtures';

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
  let usersRepository: UsersRepository = new MongoDBUsersRepository({});
  let bucketEntryShardsRepository: BucketEntryShardsRepository = new MongoDBBucketEntryShardsRepository({});

  let networkQueue: any = {
    enqueueMessage: (message: any) => {}
  };

  let shardsUseCase = new ShardsUsecase(
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
    mirrorsRepository,
    shardsUseCase,
    usersRepository
  );
  
  beforeEach(() => {
    bucketEntriesRepository = new MongoDBBucketEntriesRepository({});
    mirrorsRepository = new MongoDBMirrorsRepository({});
    framesRepository = new MongoDBFramesRepository({});
    shardsRepository = new MongoDBShardsRepository({});
    bucketsRepository = new MongoDBBucketsRepository({});
    pointersRepository = new MongoDBPointersRepository({});

    shardsUseCase = new ShardsUsecase(
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
      mirrorsRepository,
      shardsUseCase,
      usersRepository
    );

    restore();
  });

  describe('removeFilesV1()', () => {
    it('Should delete files even if nothing more exists', async () => {
      const bucketEntries = fixtures.getBucketEntriesWithoutFrames();

      const findFramesByIdsStub = stub(framesRepository, 'findByIds').resolves([]);
      const findPointersByIdsStub = stub(pointersRepository, 'findByIds').resolves([]);
      const deleteBucketEntriesByIdsStub = stub(
        bucketEntriesRepository,
        'deleteByIds'
      );
    
      await bucketEntriesUsecase.removeFilesV1(bucketEntries);

      expect(findFramesByIdsStub.calledOnce).toBeTruthy();
      expect(findPointersByIdsStub.calledOnce).toBeTruthy();        
      expect(deleteBucketEntriesByIdsStub.calledOnce).toBeTruthy();

      expect(findPointersByIdsStub.calledAfter(findFramesByIdsStub)).toBeTruthy();
      expect(deleteBucketEntriesByIdsStub.calledAfter(findPointersByIdsStub)).toBeTruthy();
      expect(deleteBucketEntriesByIdsStub.calledWith(bucketEntries.map(b => b.id))).toBeTruthy();
    });

    it('Should skip shards deletion if do not exist', async () => {
      const bucketEntries = fixtures.getBucketEntriesWithoutFrames();

      stub(framesRepository, 'findByIds').resolves([]);
      stub(pointersRepository, 'findByIds').resolves([]);
      stub(bucketEntriesRepository, 'deleteByIds');

      const deleteStorageStub = stub(shardsUseCase, 'deleteShardsStorageByHashes');
      const deleteShardsStub = stub(shardsRepository, 'deleteByHashes');

      await bucketEntriesUsecase.removeFilesV1(bucketEntries);

      expect(deleteShardsStub.callCount).toBe(0);
      expect(deleteStorageStub.callCount).toBe(0);
    });

    it('Should skip pointers deletion if do not exist', async () => {
      const bucketEntries = fixtures.getBucketEntriesWithoutFrames();

      stub(framesRepository, 'findByIds').resolves([]);
      stub(pointersRepository, 'findByIds').resolves([]);
      stub(bucketEntriesRepository, 'deleteByIds');

      const deletePointersStub = stub(pointersRepository, 'deleteByIds');

      await bucketEntriesUsecase.removeFilesV1(bucketEntries);

      expect(deletePointersStub.callCount).toBe(0);
    });

    it('Should skip frames deletion if do not exist', async () => {
      const bucketEntries = fixtures.getBucketEntriesWithoutFrames();

      stub(framesRepository, 'findByIds').resolves([]);
      stub(pointersRepository, 'findByIds').resolves([]);
      stub(bucketEntriesRepository, 'deleteByIds');

      const deleteFramesStub = stub(framesRepository, 'deleteByIds');

      await bucketEntriesUsecase.removeFilesV1(bucketEntries);

      expect(deleteFramesStub.callCount).toBe(0);
    });

    it('Should delete frames if they exist', async () => {
      const bucketEntries = fixtures.getBucketEntriesWithoutFrames();
      const frames = bucketEntries.map(b => fixtures.getFrame({ id: b.frame }));

      stub(framesRepository, 'findByIds').resolves(frames);
      stub(pointersRepository, 'findByIds').resolves([]);
      stub(bucketEntriesRepository, 'deleteByIds');

      const deleteFramesStub = stub(framesRepository, 'deleteByIds');

      await bucketEntriesUsecase.removeFilesV1(bucketEntries);

      expect(deleteFramesStub.calledOnce).toBeTruthy();
      expect(deleteFramesStub.calledWith(frames.map(f => f.id))).toBeTruthy();
    });

    it('Should delete pointers and shards if they exist', async () => {
      const bucketEntries = fixtures.getBucketEntriesWithoutFrames();
      const frames = bucketEntries.map(b => fixtures.getFrame({ id: b.frame, shards: [ fixtures.getPointer().id ] }));
      const pointers = frames.flatMap(f => f.shards.map(pId => fixtures.getPointer({ id: pId })));

      stub(framesRepository, 'findByIds').resolves(frames);
      stub(pointersRepository, 'findByIds').resolves(pointers);
      stub(bucketEntriesRepository, 'deleteByIds');
      stub(framesRepository, 'deleteByIds');

      const deletePointersStub = stub(pointersRepository, 'deleteByIds');
      const deleteStorageStub = stub(shardsUseCase, 'deleteShardsStorageByHashes');
      const deleteShardsStub = stub(shardsRepository, 'deleteByHashes');

      await bucketEntriesUsecase.removeFilesV1(bucketEntries);

      expect(deletePointersStub.calledOnce).toBeTruthy();
      expect(deletePointersStub.calledWith(pointers.map(p => p.id))).toBeTruthy();

      expect(deleteShardsStub.calledOnce).toBeTruthy();
      expect(deleteShardsStub.calledWith(pointers.map(p => p.hash))).toBeTruthy();

      expect(deleteStorageStub.calledOnce).toBeTruthy();
      expect(deleteStorageStub.calledWith(pointers.map(p => p.hash))).toBeTruthy();
    });
  });

  describe('removeFilesV2()', () => {
    it('Should delete files even if nothing more exists', async () => {
      const bucketEntries = fixtures.getBucketEntriesWithoutFrames();

      stub(bucketEntryShardsRepository, 'findByBucketEntries').resolves([]);
      stub(shardsRepository, 'findByIds').resolves([]);
      const deleteBucketEntriesByIdsStub = stub(
        bucketEntriesRepository,
        'deleteByIds'
      );
    
      await bucketEntriesUsecase.removeFilesV2(bucketEntries);

      expect(deleteBucketEntriesByIdsStub.calledOnce).toBeTruthy();
      expect(deleteBucketEntriesByIdsStub.calledWith(bucketEntries.map(b => b.id))).toBeTruthy();
    });

    it('Should skip shards deletion if do not exist', async () => {
      const bucketEntries = fixtures.getBucketEntriesWithoutFrames();

      stub(bucketEntryShardsRepository, 'findByBucketEntries').resolves([]);
      stub(shardsRepository, 'findByIds').resolves([]);
      stub(bucketEntriesRepository, 'deleteByIds').resolves();
      
      const deleteStorageStub = stub(shardsUseCase, 'deleteShardsStorageByUuids');
      const deleteShards = stub(shardsRepository, 'deleteByIds');

      await bucketEntriesUsecase.removeFilesV2(bucketEntries);

      expect(deleteStorageStub.callCount).toBe(0);
      expect(deleteShards.callCount).toBe(0);
    });

    it('Should skip bucket entry shards deletion if do not exist', async () => {
      const bucketEntries = fixtures.getBucketEntriesWithoutFrames();

      stub(bucketEntryShardsRepository, 'findByBucketEntries').resolves([]);
      stub(shardsRepository, 'findByIds').resolves([]);
      stub(bucketEntriesRepository, 'deleteByIds').resolves()
      
      const deleteBucketEntryShardsStub = stub(bucketEntryShardsRepository, 'deleteByIds');

      await bucketEntriesUsecase.removeFilesV2(bucketEntries);

      expect(deleteBucketEntryShardsStub.callCount).toBe(0);
    });

    it('Should delete bucket entry shards if they exist', async () => {
      const bucketEntries = fixtures.getBucketEntriesWithoutFrames();
      const bucketEntryShards = bucketEntries.map(b => fixtures.getBucketEntryShard({ bucketEntry: b.id }))

      stub(bucketEntryShardsRepository, 'findByBucketEntries').resolves(bucketEntryShards);
      stub(shardsRepository, 'findByIds').resolves([]);
      stub(bucketEntriesRepository, 'deleteByIds').resolves()
      
      const deleteBucketEntryShardsStub = stub(bucketEntryShardsRepository, 'deleteByIds');

      await bucketEntriesUsecase.removeFilesV2(bucketEntries);

      expect(deleteBucketEntryShardsStub.calledOnce).toBeTruthy();
      expect(deleteBucketEntryShardsStub.calledWith(bucketEntryShards.map(b => b.id)));
    });

    it('Should delete shards shards if they exist', async () => {
      const bucketEntries = fixtures.getBucketEntriesWithoutFrames();
      const bucketEntryShards = bucketEntries.map(b => fixtures.getBucketEntryShard({ bucketEntry: b.id }))

      stub(bucketEntryShardsRepository, 'findByBucketEntries').resolves(bucketEntryShards);
      stub(shardsRepository, 'findByIds').resolves([]);
      stub(bucketEntriesRepository, 'deleteByIds').resolves()
      
      const deleteBucketEntryShardsStub = stub(bucketEntryShardsRepository, 'deleteByIds');

      await bucketEntriesUsecase.removeFilesV2(bucketEntries);

      expect(deleteBucketEntryShardsStub.calledOnce).toBeTruthy();
      expect(deleteBucketEntryShardsStub.calledWith(bucketEntryShards.map(b => b.id)));
    });
  });

  describe('removeFile()', () => {
    it('Should throw an error if the bucket entry does not exist', async () => {
      try {
        stub(bucketEntriesRepository, 'findOne').resolves(null);

        await bucketEntriesUsecase.removeFile('file-id');
      } catch (err) {
        expect(err).toBeInstanceOf(BucketEntryNotFoundError);
      }
    });

    describe('Should delete a version 1 file', () => {
      it('When has no version', async () => {
        const fileId = 'file-id';
        const bucketEntry = fixtures.getBucketEntry({
          id: fileId,
          version: undefined
        })

        stub(bucketEntriesRepository, 'findOne').resolves(bucketEntry);
        const removeFilesV1Stub = stub(bucketEntriesUsecase, 'removeFilesV1').resolves();
  
        await bucketEntriesUsecase.removeFile(fileId);

        expect(removeFilesV1Stub.calledOnce).toBeTruthy();
        expect(removeFilesV1Stub.calledWith([bucketEntry])).toBeTruthy();
      });

      it('When has version 1', async () => {
        const fileId = 'file-id';
        const bucketEntry = fixtures.getBucketEntry({
          id: fileId,
          version: 1
        })

        stub(bucketEntriesRepository, 'findOne').resolves(bucketEntry);
        const removeFilesV1Stub = stub(bucketEntriesUsecase, 'removeFilesV1').resolves();
  
        await bucketEntriesUsecase.removeFile(fileId);

        expect(removeFilesV1Stub.calledOnce).toBeTruthy();
        expect(removeFilesV1Stub.calledWith([bucketEntry])).toBeTruthy();
      });
    });

    describe('Should delete a version 2 file', () => {
      it('When user and bucket exist', async () => {
        const user = fixtures.getUser({ id: userEmail });
        const fileId = 'file-id';
        const bucket = fixtures.getBucket({ user: user.id });
        const bucketEntry = fixtures.getBucketEntry({
          id: fileId,
          version: 2,
          bucket: bucket.id
        })

        stub(bucketEntriesRepository, 'findOne').resolves(bucketEntry);
        const findBucketStub = stub(bucketsRepository, 'findOne').resolves(bucket);
        const findUserStub = stub(usersRepository, 'findById').resolves(user);
        const addTotalSpaceStub = stub(usersRepository, 'addTotalUsedSpaceBytes').resolves();

        const removeFilesV2Stub = stub(bucketEntriesUsecase, 'removeFilesV2').resolves();

        await bucketEntriesUsecase.removeFile(fileId);

        expect(removeFilesV2Stub.calledOnce).toBeTruthy();
        expect(removeFilesV2Stub.calledWith([bucketEntry])).toBeTruthy();

        expect(findBucketStub.calledOnce).toBeTruthy();
        expect(findBucketStub.calledWith({ id: bucket.id })).toBeTruthy();

        expect(findUserStub.calledOnce).toBeTruthy();
        expect(findUserStub.calledWith(bucket.user)).toBeTruthy();

        expect(addTotalSpaceStub.calledOnce).toBeTruthy();
        expect(addTotalSpaceStub.calledWith(bucket.user, -bucketEntry.size!)).toBeTruthy();
      });

      it('When bucket exists but user not', async () => {
        const user = fixtures.getUser({ id: userEmail });
        const fileId = 'file-id';
        const bucket = fixtures.getBucket({ user: '' });
        const bucketEntry = fixtures.getBucketEntry({
          id: fileId,
          version: 2,
          bucket: bucket.id
        });

        stub(bucketEntriesRepository, 'findOne').resolves(bucketEntry);
        const findBucketStub = stub(bucketsRepository, 'findOne').resolves(bucket);
        const findUserStub = stub(usersRepository, 'findById').resolves(user);
        const addTotalSpaceStub = stub(usersRepository, 'addTotalUsedSpaceBytes').resolves();

        const removeFilesV2Stub = stub(bucketEntriesUsecase, 'removeFilesV2').resolves();

        await bucketEntriesUsecase.removeFile(fileId);

        expect(removeFilesV2Stub.calledOnce).toBeTruthy();
        expect(removeFilesV2Stub.calledWith([bucketEntry])).toBeTruthy();

        expect(findBucketStub.calledOnce).toBeTruthy();
        expect(findBucketStub.calledWith({ id: bucket.id })).toBeTruthy();

        expect(findUserStub.callCount).toBe(0)
        expect(addTotalSpaceStub.callCount).toBe(0);
      });

      it('When bucket do not exist', async () => {
        const user = fixtures.getUser({ id: userEmail });
        const fileId = 'file-id';
        const bucket = fixtures.getBucket({ user: '' });
        const bucketEntry = fixtures.getBucketEntry({
          id: fileId,
          version: 2,
          bucket: bucket.id
        });

        stub(bucketEntriesRepository, 'findOne').resolves(bucketEntry);
        const findBucketStub = stub(bucketsRepository, 'findOne').resolves(null);
        const findUserStub = stub(usersRepository, 'findById').resolves(user);
        const addTotalSpaceStub = stub(usersRepository, 'addTotalUsedSpaceBytes').resolves();

        const removeFilesV2Stub = stub(bucketEntriesUsecase, 'removeFilesV2').resolves();

        await bucketEntriesUsecase.removeFile(fileId);

        expect(removeFilesV2Stub.calledOnce).toBeTruthy();
        expect(removeFilesV2Stub.calledWith([bucketEntry])).toBeTruthy();

        expect(findBucketStub.calledOnce).toBeTruthy();
        expect(findBucketStub.calledWith({ id: bucket.id })).toBeTruthy();

        expect(findUserStub.callCount).toBe(0)
        expect(addTotalSpaceStub.callCount).toBe(0);
      });
    });

    it('Should throw an error if the file version is unknown', async () => {
      const fileId = 'file-id';
      const bucketEntry = fixtures.getBucketEntry({
        id: fileId,
        version: 3
      })

      stub(bucketEntriesRepository, 'findOne').resolves(bucketEntry);

      try { 
        await bucketEntriesUsecase.removeFile(fileId);
        expect(true).toBeFalsy();
      } catch (err) {
        expect(err).toBeInstanceOf(BucketEntryVersionNotFoundError);
      }
    });
  });

  describe('removeFileFromUser()', () => {
    it('Should throw an error if bucket is not found', async () => {
      try {
        const user = fixtures.getUser({ id: userEmail });
        const bucket = fixtures.getBucket({ user: user.id + 'x' });
        const fileId = 'file-id';

        stub(bucketsRepository, 'findOne').resolves(null);

        await bucketEntriesUsecase.removeFileFromUser(bucket.id, fileId, user.id);
      } catch (err) {
        expect(err).toBeInstanceOf(BucketNotFoundError);
      }
    });

    it('Should throw an error if bucket is not owned by the user', async () => {
      try {
        const user = fixtures.getUser({ id: userEmail });
        const bucket = fixtures.getBucket({ user: user.id + 'x' });
        const fileId = 'file-id';

        stub(bucketsRepository, 'findOne').resolves(bucket);

        await bucketEntriesUsecase.removeFileFromUser(bucket.id, fileId, user.id);
      } catch (err) {
        expect(err).toBeInstanceOf(BucketForbiddenError);
      }
    });

    it('Should try to remove the file if the bucket exists and is owned by the user', async () => {
      const user = fixtures.getUser({ id: userEmail });
      const bucket = fixtures.getBucket({ user: user.id });
      const fileId = 'file-id';

      const findBucketStub = stub(bucketsRepository, 'findOne').resolves(bucket);
      const removeFileStub = stub(bucketEntriesUsecase, 'removeFile').resolves();

      await bucketEntriesUsecase.removeFileFromUser(bucket.id, fileId, user.id);

      expect(findBucketStub.calledOnce).toBeTruthy();
      expect(findBucketStub.calledWith({ id: bucket.id })).toBeTruthy();

      expect(removeFileStub.calledOnce).toBeTruthy();
      expect(removeFileStub.calledWith(fileId)).toBeTruthy();
    });
  });

  describe('removeFileAndValidateBucketExists()', () => {
    it('Should throw an error if bucket is not found', async () => {
      try {
        const bucket = fixtures.getBucket();
        const fileId = 'file-id';

        stub(bucketsRepository, 'findOne').resolves(null);

        await bucketEntriesUsecase.removeFileAndValidateBucketExists(bucket.id, fileId);
      } catch (err) {
        expect(err).toBeInstanceOf(BucketNotFoundError);
      }
    });

    it('Should try to remove the file if the bucket exists', async () => {
      const user = fixtures.getUser({ id: userEmail });
      const bucket = fixtures.getBucket({ user: user.id });
      const fileId = 'file-id';

      const findBucketStub = stub(bucketsRepository, 'findOne').resolves(bucket);
      const removeFileStub = stub(bucketEntriesUsecase, 'removeFile').resolves();

      await bucketEntriesUsecase.removeFileAndValidateBucketExists(bucket.id, fileId);

      expect(findBucketStub.calledOnce).toBeTruthy();
      expect(findBucketStub.calledWith({ id: bucket.id })).toBeTruthy();

      expect(removeFileStub.calledOnce).toBeTruthy();
      expect(removeFileStub.calledWith(fileId)).toBeTruthy();
    });
  });
});