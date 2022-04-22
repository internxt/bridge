import { stub } from 'sinon';

import { UsersRepository } from '../../../../lib/core/users/Repository';
import { 
  MongoDBBucketsRepository, 
  MongoDBUsersRepository, 
  UsersUsecase, 
  InvalidDataFormatError, 
  UserAlreadyExistsError, 
  UserNotFoundError,
  RESET_PASSWORD_TOKEN_BYTES_LENGTH,
  SHA256_HASH_BYTES_LENGTH
} from '../../../../lib/core';
import { MongoDBFramesRepository } from '../../../../lib/core/frames/MongoDBFramesRepository';
import { FramesRepository } from '../../../../lib/core/frames/Repository';
import { BucketsRepository } from '../../../../lib/core/buckets/Repository';
import { Mailer, MailUsecase, SendGridMailUsecase } from '../../../../lib/core/mail/usecase';
import { EventBus, EventBusEvents } from '../../../../lib/server/eventBus';
import { createLogger } from 'winston';
import { createHash, randomBytes } from 'crypto';
import { User } from '../../../../lib/core/users/User';

let usersRepository: UsersRepository;
let framesRepository: FramesRepository;
let bucketsRepository: BucketsRepository;
let usecase: UsersUsecase;
let mailUsecase: MailUsecase;
let eventBus: EventBus;

beforeEach(() => {
  usersRepository = new MongoDBUsersRepository({});
  framesRepository = new MongoDBFramesRepository({});
  bucketsRepository = new MongoDBBucketsRepository({});
  mailUsecase = new SendGridMailUsecase({} as Mailer, {
    host: '',
    protocol: 'http:',
  });
  eventBus = new EventBus(createLogger(), mailUsecase);
  eventBus.removeAllListeners();
  usecase = new UsersUsecase(
    usersRepository, 
    framesRepository,
    bucketsRepository,
    mailUsecase,
    eventBus
  );
});

const fakeUser: User = {
  id: 'myemail@internxt.com',
  maxSpaceBytes: 0,
  uuid: 'uuid',
  password: 'fake-pass',
  activated: true,
  activator: '',
  deactivator: '',
  hashpass: '',
  isFreeTier: true,
  resetter: '',
  totalUsedSpaceBytes: 0
}

describe('Users usecases', () => {
  describe('createUser()', () => {
    it(`Should work if input data is valid`, async () => {
      stub(usersRepository, 'findById').resolves(null);
      stub(usersRepository, 'create').resolves(fakeUser);

      await usecase.createUser(fakeUser.id, fakeUser.password);
      expect(true).toBeTruthy();
    });

    it(`Should emit a ${EventBusEvents.UserCreationStarts} event`, async () => {
      const eventBusEmitterSpy = stub(eventBus, 'emit');

      stub(usersRepository, 'findById').resolves(null);
      stub(usersRepository, 'create').resolves(fakeUser);

      await usecase.createUser(fakeUser.id, fakeUser.password);

      expect(eventBusEmitterSpy.called).toBeTruthy();
      expect(eventBusEmitterSpy.calledWith(EventBusEvents.UserCreationStarts, { email: fakeUser.id }))
    });

    it(`Should emit a ${EventBusEvents.UserCreationEnds} event`, async () => {
      const eventBusEmitterSpy = stub(eventBus, 'emit');

      stub(usersRepository, 'findById').resolves(null);
      stub(usersRepository, 'create').resolves(fakeUser);

      await usecase.createUser(fakeUser.id, fakeUser.password);

      expect(eventBusEmitterSpy.called).toBeTruthy();
      expect(eventBusEmitterSpy.calledWith(EventBusEvents.UserCreationEnds, { 
        uuid: fakeUser.uuid, 
        email: fakeUser.id 
      }));
    });

    // it(`Should reject a disposable email`, async () => {
    //   const disposableEmail = 'e@bel.kr';

    //   try {
    //     await usecase.createUser(disposableEmail, fakeUser.password);
    //     expect(true).toBeFalsy();
    //   } catch (err) {
    //     expect(err).toBeInstanceOf(InvalidDataFormatError);
    //   }
    // });

    it(`Should reject if the user already exists`, async () => {
      stub(usersRepository, 'findById').resolves(fakeUser);

      try {
        await usecase.createUser(fakeUser.id, fakeUser.password);
        expect(true).toBeFalsy();
      } catch (err) {
        expect(err).toBeInstanceOf(UserAlreadyExistsError);
      }
    });
  });

  describe('requestPasswordReset()', () => {
    it('Should work if input data is valid', async () => {
      const findByIdStub = stub(usersRepository, 'findById').resolves(fakeUser);
      const updateByIdStub = stub(usersRepository, 'updateById').resolves();
      const sendResetPasswordMailStub = stub(mailUsecase, 'sendResetPasswordMail').resolves();

      const user = await usecase.requestPasswordReset(fakeUser.id, fakeUser.password);
        
      expect(findByIdStub.calledOnce).toBeTruthy();
      expect(updateByIdStub.calledOnce).toBeTruthy();
      expect(sendResetPasswordMailStub.calledOnce).toBeTruthy();
      expect(user).toStrictEqual(fakeUser);
    });

    it('Should reject if user does not exist', async () => {
      const findByIdStub = stub(usersRepository, 'findById').resolves(null);

      try {
        await usecase.requestPasswordReset(fakeUser.id, fakeUser.password);
        expect(true).toBeFalsy()
      } catch (err) {
        expect(err).toBeInstanceOf(UserNotFoundError);
      }
        
      expect(findByIdStub.calledOnce).toBeTruthy();
    });

    it('Should try to update the reset token of the user requesting the reset', async () => {
      const findByIdStub = stub(usersRepository, 'findById').resolves(fakeUser);
      const updateByIdStub = stub(usersRepository, 'updateById').resolves();
      const sendResetPasswordMailStub = stub(mailUsecase, 'sendResetPasswordMail').resolves();

      await usecase.requestPasswordReset(fakeUser.id, fakeUser.password);
        
      expect(findByIdStub.calledOnce).toBeTruthy();
      expect(updateByIdStub.calledOnce).toBeTruthy();
      expect(sendResetPasswordMailStub.calledOnce).toBeTruthy();
      
      const [userRequestingResetId, { resetter }] = updateByIdStub.args[0];

      expect(userRequestingResetId).toStrictEqual(fakeUser.id);
      expect(Buffer.from(resetter || '', 'hex').length).toBe(RESET_PASSWORD_TOKEN_BYTES_LENGTH);
    });
  });

  describe('resetPassword()', () => {
    it('Should work if input data is valid', async () => {
      const resetToken = randomBytes(RESET_PASSWORD_TOKEN_BYTES_LENGTH).toString('hex');
      const newPassword = randomBytes(SHA256_HASH_BYTES_LENGTH).toString('hex');

      const findOneStub = stub(usersRepository, 'findOne').resolves(fakeUser);
      const updateByIdStub = stub(usersRepository, 'updateById').resolves();

      const user = await usecase.resetPassword(newPassword, resetToken);

      const [{ resetter }] = findOneStub.args[0];
      const [userId, { resetter: newResetter, hashpass }] = updateByIdStub.args[0];

      expect(findOneStub.calledOnce).toBeTruthy();
      expect(resetter).not.toBeNull();
      expect(resetter).toBe(resetToken);

      expect(updateByIdStub.calledOnce).toBeTruthy();
      expect(userId).toBe(fakeUser.id);
      expect(newResetter).toBeNull();
      expect(hashpass).toBe(
        createHash('sha256').update(newPassword).digest('hex')
      );

      expect(user).toStrictEqual(fakeUser);
    });

    it('Should throw if the new password is invalid', async () => {
      const resetToken = randomBytes(RESET_PASSWORD_TOKEN_BYTES_LENGTH).toString('hex');
      const newPassword = randomBytes(SHA256_HASH_BYTES_LENGTH - 1).toString('hex');

      try {
        await usecase.resetPassword(newPassword, resetToken);
        expect(true).toBeFalsy();
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidDataFormatError);
      }
    });

    it('Should throw if the reset token is invalid', async () => {
      const resetToken = randomBytes(RESET_PASSWORD_TOKEN_BYTES_LENGTH - 1).toString('hex');
      const newPassword = randomBytes(SHA256_HASH_BYTES_LENGTH).toString('hex');

      try {
        await usecase.resetPassword(newPassword, resetToken);
        expect(true).toBeFalsy();
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidDataFormatError);
      }
    });

    it('Should throw if the user does not exist', async () => {
      const resetToken = randomBytes(RESET_PASSWORD_TOKEN_BYTES_LENGTH).toString('hex');
      const newPassword = randomBytes(SHA256_HASH_BYTES_LENGTH).toString('hex');

      stub(usersRepository, 'findOne').resolves(null);

      try {
        await usecase.resetPassword(newPassword, resetToken);
        expect(false).toBeTruthy();
      } catch (err) {
        expect(err).toBeInstanceOf(UserNotFoundError);
      }
    });
  });
});
