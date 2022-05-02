import { stub, restore } from 'sinon';
import { createLogger } from 'winston';
import Mailer from 'inxt-service-mailer';

import { BucketEntriesRepository } from '../../../../lib/core/bucketEntries/Repository';
import { FramesRepository } from '../../../../lib/core/frames/Repository';
import { GatewayUsecase } from '../../../../lib/core/gateway/Usecase';
import { MirrorsRepository } from '../../../../lib/core/mirrors/Repository';
import { PointersRepository } from '../../../../lib/core/pointers/Repository';

import { MongoDBBucketEntriesRepository } from '../../../../lib/core/bucketEntries/MongoDBBucketEntriesRepository';
import { MongoDBPointersRepository } from '../../../../lib/core/pointers/MongoDBBucketEntryShardsRepository';
import { MongoDBFramesRepository } from '../../../../lib/core/frames/MongoDBFramesRepository';
import { MongoDBMirrorsRepository } from '../../../../lib/core/mirrors/MongoDBMirrorsRepository';
import { 
  getBucketEntriesWithFrames, 
  getBucketEntriesWithoutFrames, 
  getBucketEntry, 
  getPointer
} from './fixtures';
import { Pointer } from '../../../../lib/core/pointers/Pointer';
import { EventBus, EventBusEvents } from '../../../../lib/server/eventBus';
import { MailUsecase, SendGridMailUsecase } from '../../../../lib/core/mail/usecase';

let framesRepository: FramesRepository = new MongoDBFramesRepository({});
let bucketEntriesRepository: BucketEntriesRepository = new MongoDBBucketEntriesRepository({});
let pointersRepository: PointersRepository = new MongoDBPointersRepository({});
let mirrorsRepository: MirrorsRepository = new MongoDBMirrorsRepository({});
let networkQueue: any;
let mailUsecase: MailUsecase = new SendGridMailUsecase({} as Mailer, {
  host: '',
  protocol: 'http:',
});

let logger = createLogger({
  silent: true
});
let eventBus = new EventBus(logger, mailUsecase);

let usecase = new GatewayUsecase(
  bucketEntriesRepository, 
  framesRepository,
  pointersRepository,
  mirrorsRepository,
  eventBus,
  networkQueue
);

beforeEach(() => {
  framesRepository = new MongoDBFramesRepository({});
  bucketEntriesRepository = new MongoDBBucketEntriesRepository({});
  pointersRepository = new MongoDBPointersRepository({});
  mirrorsRepository = new MongoDBMirrorsRepository({});
  eventBus = new EventBus(logger, mailUsecase);

  usecase = new GatewayUsecase(
    bucketEntriesRepository, 
    framesRepository,
    pointersRepository,
    mirrorsRepository,
    eventBus,
    networkQueue
  );

  restore();
});

const bucketEntriesWithFrames = getBucketEntriesWithFrames();
const bucketEntriesWithoutFrames = getBucketEntriesWithoutFrames();

function getPointersFromBucketEntries(bucketEntries: typeof bucketEntriesWithFrames): Pointer[] {
  return bucketEntries.flatMap((be) => {
    return be.frame.shards.flatMap((pId) => getPointer({ id: pId }));
  });
}

describe('Gateway usecases', () => {
  describe('deleteFilesInBulk()', () => {
    describe('Should work properly', () => {
      it('When files exist and have frames', async () => {
        const existingBucketEntries = bucketEntriesWithFrames;
        const existingFrames = existingBucketEntries.map(be => be.frame);
        const existingPointers = getPointersFromBucketEntries(existingBucketEntries);

        const findBucketEntriesByIdsWithFramesStub = stub(
          bucketEntriesRepository, 
          'findByIdsWithFrames'
        ).resolves(
          existingBucketEntries
        );        

        const deleteBucketEntriesByIdsStub = stub(bucketEntriesRepository, 'deleteByIds');
        const findPointersByIdsStub = stub(pointersRepository, 'findByIds').resolves(existingPointers);
        const deleteFramesByIdsStub = stub(framesRepository, 'deleteByIds').resolves();
        const deletePointersStub = stub(usecase, 'deletePointers').resolves();

        const expected = existingBucketEntries.map(be => be.id);
        const received = await usecase.deleteFilesInBulk(expected);
        
        expect(findBucketEntriesByIdsWithFramesStub.calledOnce).toBeTruthy();
        expect(findBucketEntriesByIdsWithFramesStub.firstCall.args).toStrictEqual([expected]);

        expect(deleteBucketEntriesByIdsStub.callCount).toEqual(1);
        expect(deleteBucketEntriesByIdsStub.firstCall.args).toStrictEqual([expected]);

        expect(findPointersByIdsStub.calledOnce).toBeTruthy();
        expect(findPointersByIdsStub.firstCall.args).toStrictEqual([existingPointers.map(p => p.id)]);

        expect(deletePointersStub.calledOnce).toBeTruthy();
        expect(deletePointersStub.firstCall.args).toStrictEqual([existingPointers]);

        expect(deleteFramesByIdsStub.calledOnce).toBeTruthy();
        expect(deleteFramesByIdsStub.firstCall.args).toStrictEqual([existingFrames.map(f => f.id)]);
        
        expect(received).toStrictEqual(expected);
      });

      it('When files exist and do not have frames', async () => {
        const existingBucketEntries = bucketEntriesWithoutFrames;

        const findBucketEntriesByIdsWithFramesStub = stub(
          bucketEntriesRepository, 
          'findByIdsWithFrames'
        ).resolves(
          existingBucketEntries
        );        

        const deleteBucketEntriesByIdsStub = stub(bucketEntriesRepository, 'deleteByIds');
        const findPointersByIdsStub = stub(pointersRepository, 'findByIds').resolves([]);
        const deleteFramesByIdsStub = stub(framesRepository, 'deleteByIds').resolves();
        const deletePointersStub = stub(usecase, 'deletePointers').resolves();

        const expected = existingBucketEntries.map(be => be.id);
        const received = await usecase.deleteFilesInBulk(expected);
        
        expect(findBucketEntriesByIdsWithFramesStub.calledOnce).toBeTruthy();
        expect(findBucketEntriesByIdsWithFramesStub.firstCall.args).toStrictEqual([expected]);

        expect(deleteBucketEntriesByIdsStub.callCount).toEqual(1);
        expect(deleteBucketEntriesByIdsStub.firstCall.args).toStrictEqual([existingBucketEntries.map(be => be.id)]);

        expect(findPointersByIdsStub.callCount).toEqual(0);
        expect(deletePointersStub.callCount).toEqual(0);
        expect(deleteFramesByIdsStub.callCount).toEqual(0);
        
        expect(received).toStrictEqual(expected);
      });

      it('When files exist and some have frames and some not', async () => {
        const existingBucketEntriesWithFrames = bucketEntriesWithFrames;
        const existingBucketEntriesWithoutFrames = bucketEntriesWithoutFrames;
        const existingFrames = existingBucketEntriesWithFrames.map(be => be.frame);
        const existingBucketEntries = [
          ...existingBucketEntriesWithoutFrames, 
          ...existingBucketEntriesWithFrames
        ];
        const existingPointers = getPointersFromBucketEntries(existingBucketEntriesWithFrames);

        const findBucketEntriesByIdsWithFramesStub = stub(
          bucketEntriesRepository, 
          'findByIdsWithFrames'
        ).resolves(
          existingBucketEntries
        );        

        const deleteBucketEntriesByIdsStub = stub(bucketEntriesRepository, 'deleteByIds');
        const findPointersByIdsStub = stub(pointersRepository, 'findByIds').resolves(existingPointers);
        const deleteFramesByIdsStub = stub(framesRepository, 'deleteByIds').resolves();
        const deletePointersStub = stub(usecase, 'deletePointers').resolves();

        const expected = existingBucketEntries.map(be => be.id);
        const received = await usecase.deleteFilesInBulk(expected);
        
        expect(findBucketEntriesByIdsWithFramesStub.calledOnce).toBeTruthy();
        expect(findBucketEntriesByIdsWithFramesStub.firstCall.args).toStrictEqual([expected]);

        expect(deleteBucketEntriesByIdsStub.callCount).toEqual(2);
        expect(deleteBucketEntriesByIdsStub.firstCall.args).toStrictEqual([existingBucketEntriesWithoutFrames.map(be => be.id)]);
        expect(deleteBucketEntriesByIdsStub.secondCall.args).toStrictEqual([existingBucketEntriesWithFrames.map(be => be.id)]);

        expect(findPointersByIdsStub.calledOnce).toBeTruthy();
        expect(findPointersByIdsStub.firstCall.args).toStrictEqual([existingPointers.map(p => p.id)]);

        expect(deletePointersStub.calledOnce).toBeTruthy();
        expect(deletePointersStub.firstCall.args).toStrictEqual([existingPointers]);

        expect(deleteFramesByIdsStub.calledOnce).toBeTruthy();
        expect(deleteFramesByIdsStub.firstCall.args).toStrictEqual([existingFrames.map(f => f.id)]);
        
        expect(received).toStrictEqual(expected);
      });

      it('When files do not exist', async () => {
        const nonExistingBucketEntries = bucketEntriesWithFrames;

        const findBucketEntriesByIdsWithFramesStub = stub(
          bucketEntriesRepository, 
          'findByIdsWithFrames'
        ).resolves([]);        

        const deleteBucketEntriesByIdsStub = stub(bucketEntriesRepository, 'deleteByIds');
        const findPointersByIdsStub = stub(pointersRepository, 'findByIds').resolves([]);
        const deleteFramesByIdsStub = stub(framesRepository, 'deleteByIds').resolves();
        const deletePointersStub = stub(usecase, 'deletePointers').resolves();

        const expected = nonExistingBucketEntries.map(be => be.id);
        const received = await usecase.deleteFilesInBulk(expected);
        
        expect(findBucketEntriesByIdsWithFramesStub.calledOnce).toBeTruthy();
        expect(findBucketEntriesByIdsWithFramesStub.firstCall.args).toStrictEqual([expected]);

        expect(deleteBucketEntriesByIdsStub.callCount).toEqual(0);
        expect(findPointersByIdsStub.callCount).toEqual(0);
        expect(deletePointersStub.callCount).toEqual(0);
        expect(deleteFramesByIdsStub.callCount).toEqual(0);
        
        expect(received).toStrictEqual(expected);
      });

      it('When some files with frames exist and some not', async () => {
        const existingBucketEntries = bucketEntriesWithFrames;
        const nonExistingBucketEntries = bucketEntriesWithoutFrames;
    
        const existingFrames = existingBucketEntries.map(be => be.frame);
        const existingPointers = getPointersFromBucketEntries(existingBucketEntries);

        const findBucketEntriesByIdsWithFramesStub = stub(
          bucketEntriesRepository, 
          'findByIdsWithFrames'
        ).resolves(
          existingBucketEntries
        );        

        const deleteBucketEntriesByIdsStub = stub(bucketEntriesRepository, 'deleteByIds');
        const findPointersByIdsStub = stub(pointersRepository, 'findByIds').resolves(existingPointers);
        const deleteFramesByIdsStub = stub(framesRepository, 'deleteByIds').resolves();
        const deletePointersStub = stub(usecase, 'deletePointers').resolves();

        const expected = nonExistingBucketEntries.map(be => be.id).concat(
          existingBucketEntries.map(be => be.id)
        );
        const received = await usecase.deleteFilesInBulk(expected);
        
        expect(findBucketEntriesByIdsWithFramesStub.calledOnce).toBeTruthy();
        expect(findBucketEntriesByIdsWithFramesStub.firstCall.args).toStrictEqual([expected]);

        expect(deleteBucketEntriesByIdsStub.callCount).toEqual(1);
        expect(deleteBucketEntriesByIdsStub.firstCall.args).toStrictEqual([existingBucketEntries.map(be => be.id)]);

        expect(findPointersByIdsStub.calledOnce).toBeTruthy();
        expect(findPointersByIdsStub.firstCall.args).toStrictEqual([existingPointers.map(p => p.id)]);

        expect(deletePointersStub.calledOnce).toBeTruthy();
        expect(deletePointersStub.firstCall.args).toStrictEqual([existingPointers]);

        expect(deleteFramesByIdsStub.calledOnce).toBeTruthy();
        expect(deleteFramesByIdsStub.firstCall.args).toStrictEqual([existingFrames.map(f => f.id)]);
        
        expect(received).toStrictEqual(expected);
      });

      it('When some files without frames exist and some not', async () => {
        const existingBucketEntries = bucketEntriesWithoutFrames;
        const nonExistingBucketEntries = bucketEntriesWithFrames;

        const findBucketEntriesByIdsWithFramesStub = stub(
          bucketEntriesRepository, 
          'findByIdsWithFrames'
        ).resolves(
          existingBucketEntries
        );        

        const deleteBucketEntriesByIdsStub = stub(bucketEntriesRepository, 'deleteByIds');
        const findPointersByIdsStub = stub(pointersRepository, 'findByIds').resolves([]);
        const deleteFramesByIdsStub = stub(framesRepository, 'deleteByIds').resolves();
        const deletePointersStub = stub(usecase, 'deletePointers').resolves();

        const expected = nonExistingBucketEntries.map(be => be.id).concat(
          existingBucketEntries.map(be => be.id)
        );
        const received = await usecase.deleteFilesInBulk(expected);
        
        expect(findBucketEntriesByIdsWithFramesStub.calledOnce).toBeTruthy();
        expect(findBucketEntriesByIdsWithFramesStub.firstCall.args).toStrictEqual([expected]);

        expect(deleteBucketEntriesByIdsStub.callCount).toEqual(1);
        expect(deleteBucketEntriesByIdsStub.firstCall.args).toStrictEqual([existingBucketEntries.map(be => be.id)]);

        expect(findPointersByIdsStub.callCount).toEqual(0);
        expect(deletePointersStub.callCount).toEqual(0);
        expect(deleteFramesByIdsStub.callCount).toEqual(0);
        
        expect(received).toStrictEqual(expected);
      })

      it('When some files with and without frames exist and some not', async () => {
        const existingBucketEntriesWithoutFrames = bucketEntriesWithoutFrames;
        const existingBucketEntriesWithFrames = bucketEntriesWithFrames;

        const existingFrames = existingBucketEntriesWithFrames.map(be => be.frame);
        const existingPointers = getPointersFromBucketEntries(bucketEntriesWithFrames);

        const existingBucketEntries = [
          ...existingBucketEntriesWithoutFrames, 
          ...existingBucketEntriesWithFrames
        ];
        const nonExistingBucketEntries = [getBucketEntry()];

        const findBucketEntriesByIdsWithFramesStub = stub(
          bucketEntriesRepository, 
          'findByIdsWithFrames'
        ).resolves(
          existingBucketEntries
        );        

        const deleteBucketEntriesByIdsStub = stub(bucketEntriesRepository, 'deleteByIds');
        const findPointersByIdsStub = stub(pointersRepository, 'findByIds').resolves(existingPointers);
        const deleteFramesByIdsStub = stub(framesRepository, 'deleteByIds');
        const deletePointersStub = stub(usecase, 'deletePointers');

        const expected = nonExistingBucketEntries.map(be => be.id).concat(
          existingBucketEntries.map(be => be.id)
        );
        const received = await usecase.deleteFilesInBulk(expected);
        
        expect(findBucketEntriesByIdsWithFramesStub.calledOnce).toBeTruthy();
        expect(findBucketEntriesByIdsWithFramesStub.firstCall.args).toStrictEqual([expected]);

        expect(deleteBucketEntriesByIdsStub.callCount).toEqual(2);
        expect(deleteBucketEntriesByIdsStub.firstCall.args).toStrictEqual([
          existingBucketEntriesWithoutFrames.map(be => be.id)
        ]);
        expect(deleteBucketEntriesByIdsStub.secondCall.args).toStrictEqual([
          existingBucketEntriesWithFrames.map(be => be.id)
        ]);

        expect(findPointersByIdsStub.callCount).toEqual(1);
        expect(findPointersByIdsStub.firstCall.args).toStrictEqual([existingPointers.map(p => p.id)]);

        expect(deletePointersStub.callCount).toEqual(1);
        expect(deletePointersStub.firstCall.args).toStrictEqual([existingPointers]);

        expect(deleteFramesByIdsStub.callCount).toEqual(1);
        expect(deleteFramesByIdsStub.firstCall.args).toStrictEqual([existingFrames.map(f => f.id)]);
        
        expect(received).toStrictEqual(expected);
      })
    });

    describe('Should handle errors properly', () => {
      it('Should emit any error that happens', async () => {
        const error = new Error('An error');
        const existingBucketEntries = bucketEntriesWithFrames;
        const existingBucketEntriesIds = existingBucketEntries.map(be => be.id);

        stub(bucketEntriesRepository, 'findByIdsWithFrames').rejects(error);   
        
        const emitterSpy = jest.spyOn(eventBus, 'emit');
        
        const expected: string[] = [];
        const received = await usecase.deleteFilesInBulk(existingBucketEntriesIds);

        expect(emitterSpy).toHaveBeenCalledTimes(1);
        expect(emitterSpy).toHaveBeenCalledWith(
          EventBusEvents.FilesBulkDeleteFailed, 
          { err: error, fileIds: existingBucketEntriesIds }
        );
        expect(received).toStrictEqual(expected);
      })
    });
  });
});
