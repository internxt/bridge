import { stub } from 'sinon';
import { v4 } from 'uuid';
import { createLogger } from 'winston';
import { createHash, randomBytes } from 'crypto';

import { UsersRepository } from '../../../../lib/core/users/Repository';
import { 
  MongoDBBucketsRepository, 
  MongoDBUsersRepository, 
  UsersUsecase, 
  InvalidDataFormatError, 
  UserAlreadyExistsError, 
  UserNotFoundError,
  RESET_PASSWORD_TOKEN_BYTES_LENGTH,
  SHA256_HASH_BYTES_LENGTH,
  EmailIsAlreadyInUseError
} from '../../../../lib/core';
import { MongoDBFramesRepository } from '../../../../lib/core/frames/MongoDBFramesRepository';
import { FramesRepository } from '../../../../lib/core/frames/Repository';
import { BucketsRepository } from '../../../../lib/core/buckets/Repository';
import { Mailer, MailUsecase, SendGridMailUsecase } from '../../../../lib/core/mail/usecase';
import { EventBus, EventBusEvents } from '../../../../lib/server/eventBus';
import { User } from '../../../../lib/core/users/User';
import { Notifications } from '../../../../lib/server/notifications';
import fixtures from '../fixtures';

let usersRepository: UsersRepository;
let framesRepository: FramesRepository;
let bucketsRepository: BucketsRepository;
let usecase: UsersUsecase;
let mailUsecase: MailUsecase;
let eventBus: EventBus;
let notifications: Notifications;

beforeEach(() => {
  usersRepository = new MongoDBUsersRepository({});
  framesRepository = new MongoDBFramesRepository({});
  bucketsRepository = new MongoDBBucketsRepository({});
  mailUsecase = new SendGridMailUsecase({} as Mailer, {
    host: '',
    protocol: 'http:',
  });
  notifications = new Notifications('','');
  eventBus = new EventBus(createLogger(), mailUsecase, notifications);
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
  id: v4(),
  maxSpaceBytes: 0,
  uuid: 'uuid',
  email: 'myemail@internxt.com',
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
      stub(usersRepository, 'findByEmail').resolves(null);
      stub(usersRepository, 'create').resolves(fakeUser);

      await usecase.createUser(fakeUser.email, fakeUser.password);
      expect(true).toBeTruthy();
    });

    it(`Should emit a ${EventBusEvents.UserCreationStarts} event`, async () => {
      const eventBusEmitterSpy = stub(eventBus, 'emit');

      stub(usersRepository, 'findByEmail').resolves(null);
      stub(usersRepository, 'create').resolves(fakeUser);

      await usecase.createUser(fakeUser.email, fakeUser.password);

      expect(eventBusEmitterSpy.called).toBeTruthy();
      expect(eventBusEmitterSpy.calledWith(EventBusEvents.UserCreationStarts, { email: fakeUser.id }))
    });

    it(`Should emit a ${EventBusEvents.UserCreationEnds} event`, async () => {
      const eventBusEmitterSpy = stub(eventBus, 'emit');

      stub(usersRepository, 'findByEmail').resolves(null);
      stub(usersRepository, 'create').resolves(fakeUser);

      await usecase.createUser(fakeUser.email, fakeUser.password);

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
      stub(usersRepository, 'findByEmail').resolves(fakeUser);

      try {
        await usecase.createUser(fakeUser.email, fakeUser.password);
        expect(true).toBeFalsy();
      } catch (err) {
        expect(err).toBeInstanceOf(UserAlreadyExistsError);
      }
    });
  });

  describe('requestPasswordReset()', () => {
    it('Should work if input data is valid', async () => {
      const findByIdStub = stub(usersRepository, 'findByEmail').resolves(fakeUser);
      const updateByIdStub = stub(usersRepository, 'updateById').resolves();
      const sendResetPasswordMailStub = stub(mailUsecase, 'sendResetPasswordMail').resolves();

      const user = await usecase.requestPasswordReset(fakeUser.email, fakeUser.password);
        
      expect(findByIdStub.calledOnce).toBeTruthy();
      expect(updateByIdStub.calledOnce).toBeTruthy();
      expect(sendResetPasswordMailStub.calledOnce).toBeTruthy();
      expect(user).toStrictEqual(fakeUser);
    });

    it('Should reject if user does not exist', async () => {
      const findByIdStub = stub(usersRepository, 'findByEmail').resolves(null);

      try {
        await usecase.requestPasswordReset(fakeUser.email, fakeUser.password);
        expect(true).toBeFalsy()
      } catch (err) {
        expect(err).toBeInstanceOf(UserNotFoundError);
      }
        
      expect(findByIdStub.calledOnce).toBeTruthy();
    });

    it('Should try to update the reset token of the user requesting the reset', async () => {
      const findByIdStub = stub(usersRepository, 'findByEmail').resolves(fakeUser);
      const updateByIdStub = stub(usersRepository, 'updateById').resolves();
      const sendResetPasswordMailStub = stub(mailUsecase, 'sendResetPasswordMail').resolves();

      await usecase.requestPasswordReset(fakeUser.email, fakeUser.password);
        
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

  describe('updateUserStorage()', () => {
    it('Should upgrade the user storage', async () => {
      const uuid = fakeUser.uuid;
      const bytes = fakeUser.maxSpaceBytes;
      const updateByUuidSpy = jest.spyOn(usersRepository, 'updateByUuid').mockImplementation();

      await usecase.updateUserStorage(uuid, bytes);

      expect(updateByUuidSpy).toHaveBeenCalledTimes(1);
      expect(updateByUuidSpy).toHaveBeenCalledWith(uuid, { maxSpaceBytes: bytes });
    });
  });

  describe('Updating the user email', () => {
    const user = fixtures.getUser();
    const otherUser = fixtures.getUser();

    it('When updating the email, it should work if the email is free and the user exists', async () => {
      const newFreeEmail = otherUser.email;
      
      const findOtherUser = stub(usersRepository, 'findByEmail').resolves(null);
      const findUserWhoseEmailIsChanged = stub(usersRepository, 'findByUuid').resolves(user);
      const updateFramesUserSpy = jest.spyOn(framesRepository, 'updateUser').mockImplementation();
      const updateUserEmailSpy = jest.spyOn(usersRepository, 'updateByUuid').mockImplementation();

      await usecase.updateEmail(user.uuid, newFreeEmail);

      expect(findOtherUser.calledOnce).toBeTruthy();
      expect(findOtherUser.firstCall.args).toStrictEqual([newFreeEmail]);
      expect(findUserWhoseEmailIsChanged.calledOnce).toBeTruthy();
      expect(findUserWhoseEmailIsChanged.firstCall.args).toStrictEqual([user.uuid]);
      expect(updateFramesUserSpy).toHaveBeenCalledTimes(1);
      expect(updateFramesUserSpy).toHaveBeenCalledWith(user.email, newFreeEmail);
      expect(updateUserEmailSpy).toHaveBeenCalledTimes(1);
      expect(updateUserEmailSpy).toHaveBeenCalledWith(user.uuid, { email: newFreeEmail });
    });

    it('When updating the email, it should fail when the user does not exist', async () => {
      const newFreeEmail = otherUser.email;
      
      const findOtherUser = stub(usersRepository, 'findByEmail').resolves(null);
      const findUserWhoseEmailIsChanged = stub(usersRepository, 'findByUuid').resolves(null);

      try {
        await usecase.updateEmail(user.uuid, newFreeEmail);
        expect(true).toBeFalsy();
      } catch (err) {
        expect(err).toBeInstanceOf(UserNotFoundError);
      } finally {
        expect(findOtherUser.calledOnce).toBeTruthy();
        expect(findOtherUser.firstCall.args).toStrictEqual([newFreeEmail]);
        expect(findUserWhoseEmailIsChanged.calledOnce).toBeTruthy();
        expect(findUserWhoseEmailIsChanged.firstCall.args).toStrictEqual([user.uuid]);
      }
    });

    it('When updating the email, it should fail if it is already in use by another user', async () => {
      const newFreeEmail = otherUser.email;
      
      const findOtherUser = stub(usersRepository, 'findByEmail').resolves(otherUser);
      const findUserWhoseEmailIsChanged = stub(usersRepository, 'findByUuid').resolves(user);

      try {
        await usecase.updateEmail(user.uuid, newFreeEmail);
        expect(true).toBeFalsy();
      } catch (err) {
        expect(err).toBeInstanceOf(EmailIsAlreadyInUseError);
      } finally {
        expect(findOtherUser.calledOnce).toBeTruthy();
        expect(findOtherUser.firstCall.args).toStrictEqual([newFreeEmail]);
        expect(findUserWhoseEmailIsChanged.calledOnce).toBeTruthy();
        expect(findUserWhoseEmailIsChanged.firstCall.args).toStrictEqual([user.uuid]);
      }
    });

    it('When updating the email, it should undo any change if the email update fails', async () => {
      const newFreeEmail = otherUser.email;
      const someErrorUpdatingUserEmail = new Error('Some error');
      const findOtherUser = stub(usersRepository, 'findByEmail').resolves(null);
      const findUserWhoseEmailIsChanged = stub(usersRepository, 'findByUuid').resolves(user);
      const updateFramesUserSpy = jest.spyOn(framesRepository, 'updateUser').mockImplementation();
      const updateUserEmail = stub(usersRepository, 'updateByUuid').rejects(someErrorUpdatingUserEmail);

      try {
        await usecase.updateEmail(user.uuid, newFreeEmail);
        expect(true).toBeFalsy();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toBe(someErrorUpdatingUserEmail.message);
      } finally {
        expect(findOtherUser.calledOnce).toBeTruthy();
        expect(findOtherUser.firstCall.args).toStrictEqual([newFreeEmail]);
        expect(findUserWhoseEmailIsChanged.calledOnce).toBeTruthy();
        expect(findUserWhoseEmailIsChanged.firstCall.args).toStrictEqual([user.uuid]);
        expect(updateFramesUserSpy).toHaveBeenCalledTimes(2);
        expect(updateFramesUserSpy).nthCalledWith(1, user.email, newFreeEmail);
        expect(updateFramesUserSpy).nthCalledWith(2, newFreeEmail, user.email);
        expect(updateUserEmail.calledOnce).toBeTruthy();
        expect(updateUserEmail.firstCall.args).toStrictEqual([user.uuid, { email: newFreeEmail }]);
      }
    });
  });

  describe('Requesting user destroy', () => {
    it('When requesting a user destroy, it should work if the user exists', async () => {
      const user = fixtures.getUser();
      const redirect = 'redirect';
      const findUser = stub(usersRepository, 'findByEmail').resolves(user);
      const updateById = jest.spyOn(usersRepository, 'updateById').mockImplementation();
      const eventBusEmitterSpy = jest.spyOn(eventBus, 'emit').mockImplementation();

      await usecase.requestUserDestroy(user.email, user.deactivator as string, redirect);

      expect(findUser.calledOnce).toBeTruthy();
      expect(findUser.firstCall.args).toStrictEqual([user.email]);
      expect(updateById).toBeCalledTimes(1);
      expect(updateById).toBeCalledWith(user.id, { deactivator: user.deactivator });
      expect(eventBusEmitterSpy).toBeCalledTimes(1);
      expect(eventBusEmitterSpy).toBeCalledWith(EventBusEvents.UserDestroyRequest, {
        userRequestingDestroyEmail: user.email,
        mailParams: {
          deactivator: user.deactivator,
          redirect,
        }
      });
    });

    it('When requesting a user destroy, it should fail if the user does not exist', async () => {
      const user = fixtures.getUser();
      const redirect = 'redirect';
      const findUser = stub(usersRepository, 'findByEmail').resolves(null);

      try {
        await usecase.requestUserDestroy(user.email, user.deactivator as string, redirect);
        expect(true).toBeFalsy();
      } catch (err) {
        expect(err).toBeInstanceOf(UserNotFoundError);
        expect(findUser.calledOnce).toBeTruthy();
        expect(findUser.firstCall.args).toStrictEqual([user.email]);
      }
    });
  });

  describe('Destroying a user', () => {
    it('When destroying a user, it should remove the user if it exists', async () => {
      const user = fixtures.getUser();
      const findUser = stub(usersRepository, 'findById').resolves(user);
      const deleteBuckets = jest.spyOn(bucketsRepository, 'removeAll').mockImplementation();
      const deleteFrames = jest.spyOn(framesRepository, 'removeAll').mockImplementation();
      const deleteUser = jest.spyOn(usersRepository, 'removeById').mockImplementation();

      await usecase.destroyUser(user.id);

      expect(findUser.calledOnce).toBeTruthy();
      expect(findUser.firstCall.args).toStrictEqual([user.id]);
      expect(deleteBuckets).toBeCalledTimes(1);
      expect(deleteBuckets).toBeCalledWith({ userId: user.uuid });
      expect(deleteFrames).toBeCalledTimes(1);
      expect(deleteFrames).toBeCalledWith({ user: user.email });
      expect(deleteUser).toBeCalledTimes(1);
      expect(deleteUser).toBeCalledWith(user.id);
    });

    it('When destroying a user that not exists, it fails', async () => {
      const user = fixtures.getUser();
      const findUser = stub(usersRepository, 'findById').resolves(null);
  
      try {
        await usecase.destroyUser(user.id);
        expect(true).toBeFalsy();
      } catch (err) {
        expect(err).toBeInstanceOf(UserNotFoundError);
        expect(findUser.calledOnce).toBeTruthy();
        expect(findUser.firstCall.args).toStrictEqual([user.id]);
      }
    });
  });

  describe('Confirming user destruction', () => {
    it('When confirming a destruction of a user that exists, then it works', async () => {
      const user = fixtures.getUser();
      const findUser = stub(usersRepository, 'findOne').resolves(user);
      const destroyUser = jest.spyOn(usecase, 'destroyUser').mockImplementation();

      const returnedUser = await usecase.confirmDestroyUser(user.deactivator as string);

      expect(user).toStrictEqual(returnedUser);
      expect(findUser.calledOnce).toBeTruthy();
      expect(findUser.firstCall.args).toStrictEqual([{ deactivator: user.deactivator }]);
      expect(destroyUser).toBeCalledTimes(1);
      expect(destroyUser).toBeCalledWith(user.id);

      destroyUser.mockRestore();
    });

    it('When confirming a destruction of a user that not exists, then it fails', async () => {
      const user = fixtures.getUser();
      const findUser = stub(usersRepository, 'findOne').resolves(null);
  
      try {
        await usecase.confirmDestroyUser(user.deactivator as string);
        expect(true).toBeFalsy();
      } catch (err) {
        expect(err).toBeInstanceOf(UserNotFoundError);
        expect(findUser.calledOnce).toBeTruthy();
        expect(findUser.firstCall.args).toStrictEqual([{ deactivator: user.deactivator }]);
      }
    });
  });
});
