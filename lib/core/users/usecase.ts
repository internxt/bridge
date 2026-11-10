import { createHash } from 'crypto';

import { UsersRepository } from './Repository';
import { BucketsRepository } from '../buckets/Repository';
import { MailService } from '../mail/SendGridMailService';
import { EventBus, EventBusEvents } from '../../server/eventBus';
import { FramesRepository } from '../frames/Repository';
import { BasicUser, User } from './User';

function isEmailValid(email: string) {
  // RFC 5322 Official Standard
  // eslint-disable-next-line no-control-regex
  const emailPattern = /^((?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*"))@((?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\]))$/;
  
  return email.match(emailPattern);
}

export interface UserSpaceSnapshot {
  maxSpaceBytes: number;
  totalUsedSpaceBytes: number;
}

export class UserAlreadyExistsError extends Error {
  constructor() {
    super('User already exists');

    Object.setPrototypeOf(this, UserAlreadyExistsError.prototype);
  }
}

export class InvalidDataFormatError extends Error {
  constructor(message?: string) {
    super(message ? `Malformed data: ${message}` : 'Malformed data');

    Object.setPrototypeOf(this, InvalidDataFormatError.prototype);
  }
}

export class UserNotFoundError extends Error {
  constructor(user?: string) {
    super(`User ${user || ''} not found`);

    Object.setPrototypeOf(this, UserNotFoundError.prototype);
  }
}

export class EmailIsAlreadyInUseError extends Error {
  constructor(user?: string) {
    super(`Email is already in use. Cannot be assigned ${user ? `to ${user}` : ''}`);

    Object.setPrototypeOf(this, EmailIsAlreadyInUseError.prototype);
  }
}

export class UserDeactivationDisabledError extends Error {
  constructor() {
    super('This account has the deactivation disabled');

    Object.setPrototypeOf(this, UserDeactivationDisabledError.prototype);
  }
}

export class UsersUsecase {
  constructor(
    private usersRepository: UsersRepository,
    private framesRepository: FramesRepository,
    private bucketsRepository: BucketsRepository,
    private eventBus: EventBus,
    private mailService: MailService
  ) {}

  async getUserUsage(uuid: User['uuid']): Promise<UserSpaceSnapshot> {
    const user = await this.usersRepository.findByUuid(uuid);

    if (!user) {
      throw new UserNotFoundError(uuid);
    }

    return {
      maxSpaceBytes: user.maxSpaceBytes,
      totalUsedSpaceBytes: user.totalUsedSpaceBytes,
    };
  }

  async updateEmail(uuid: User['uuid'], newEmail: User['email']): Promise<void> {
    const [maybeAlreadyExistentUser, userToUpdate] = await Promise.all([
      this.usersRepository.findByEmail(newEmail),
      this.usersRepository.findByUuid(uuid)
    ]);

    if (!userToUpdate) {
      throw new UserNotFoundError(uuid);
    }

    const aDifferentUserAlreadyHasThisEmail = 
      maybeAlreadyExistentUser && 
      maybeAlreadyExistentUser.uuid !== userToUpdate.uuid;

    if (aDifferentUserAlreadyHasThisEmail) {
      throw new EmailIsAlreadyInUseError('A different user already has this email');
    }

    await this.framesRepository.updateUser(userToUpdate.email, newEmail);

    try {
      await this.usersRepository.updateByUuid(uuid, { email: newEmail });
    } catch (err) {
      // Rollback frames update
      await this.framesRepository.updateUser(newEmail, userToUpdate.email);
      throw err;
    }
  }

  async findOrCreateUser(email: string, password: string): Promise<BasicUser> {
    const user = await this.usersRepository.findByEmail(email);

    if (user) {
      const newHassPass = createHash('sha256').update(password).digest('hex');
      const userWithModifiedPass = await this.usersRepository.updateByEmail(email, { hashpass: newHassPass }) as BasicUser;
      return userWithModifiedPass;
    }

    return this.createUser(email, password);
  }

  async createUser(email: string, password: string) {
    this.eventBus.emit(EventBusEvents.UserCreationStarts, { email });

    const maxSpaceBytes = 1024 * 1024 * 1024 * 1;
    const activated = true;

    const emailMatch = isEmailValid(email);
    const emailIsValid = !!emailMatch;

    if (!emailIsValid) {
      throw new InvalidDataFormatError('Invalid email address provided');
    }

    const maybeAlreadyExistentUser = await this.usersRepository.findByEmail(email);
    const userAlreadyExists = !!maybeAlreadyExistentUser;

    if (userAlreadyExists) {
      throw new UserAlreadyExistsError();
    }

    const user = await this.usersRepository.create({ 
      email, 
      password, 
      maxSpaceBytes, 
      activated 
    });

    this.eventBus.emit(EventBusEvents.UserCreationEnds, { uuid: user.uuid, email });

    return user;
  }

  async updateUserStorage(uuid: User['uuid'], bytes: User['maxSpaceBytes']): Promise<void> {
    await this.usersRepository.updateByUuid(uuid, { maxSpaceBytes: bytes });
  }

  async requestUserDestroy(
    userId: string,
    deactivator: string,
    redirect: string
  ): Promise<Pick<User, 'email' | 'uuid'>> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new UserNotFoundError(userId);
    }

    if (user.configuration?.disableDeactivation) {
      throw new UserDeactivationDisabledError();
    }

    await this.mailService.sendDeleteUserMail(user.email, redirect);
    await this.usersRepository.updateById(user.id, { deactivator });

    return { email: user.email, uuid: user.uuid };
  }

  async confirmDestroyUser(deactivator: string): Promise<BasicUser> {
    const user = await this.usersRepository.findOne({ deactivator });

    if (!user) {
      throw new UserNotFoundError();
    }

    await this.destroyUser(user.id);

    return user;
  }

  async destroyUser(userId: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new UserNotFoundError();
    }

    await Promise.all([
      this.bucketsRepository.removeAll({ userId: user.uuid }),
      this.framesRepository.removeAll({ user: user.email })
    ]);

    await this.usersRepository.removeById(user.id);
  }

  async findOrCreateBucket(
    uuid: User['uuid'],
    name: string
  ): Promise<{ id: string; name: string }> {
    const user = await this.usersRepository.findByUuid(uuid);

    if (!user) {
      throw new UserNotFoundError(uuid);
    }

    const existing = await this.bucketsRepository.findOne({ userId: uuid, name });

    if (existing) {
      return { id: existing.id, name: existing.name };
    }

    const created = await this.bucketsRepository.create({
      name,
      user: user.id,
      userId: user.uuid,
      status: 'Active',
      transfer: 0,
      storage: 0,
      encryptionKey: '',
    });

    return { id: created.id, name: created.name };
  }
}
