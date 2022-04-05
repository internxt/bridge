import { createHash, randomBytes } from 'crypto';

import { UsersRepository } from './Repository';
import { BucketsRepository } from '../buckets/Repository';
import { MailUsecase } from '../mail/usecase';
import { EventBus, EventBusEvents } from '../../server/eventBus';

const disposable = require('disposable-email');

function isEmailValid(email: string) {
  // RFC 5322 Official Standard
  // eslint-disable-next-line no-control-regex
  const emailPattern = /^((?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*"))@((?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\]))$/;
  
  return email.match(emailPattern);
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

export class ResetPasswordImpersonationError extends Error {
  constructor(
    userPerformingAction?: string,
    userImpersonated?: string
  ) {
    super(`User ${userPerformingAction || ''} tried to impersonate ${userImpersonated || ''}`);

    Object.setPrototypeOf(this, ResetPasswordImpersonationError.prototype);
  }
}

export class UsersUsecase {
  constructor(
    private usersRepository: UsersRepository,
    private bucketsRepository: BucketsRepository,
    private mailUsecase: MailUsecase,
    private eventBus: EventBus
  ) {}

  async createUser(email: string, password: string) {
    this.eventBus.emit(EventBusEvents.UserCreationStarts, { email });

    const maxSpaceBytes = 1024 * 1024 * 1024 * 2;
    const activated = true;

    const emailMatch = isEmailValid(email);
    const emailIsValid = !!emailMatch;

    if (!emailIsValid) {
      throw new InvalidDataFormatError('Invalid email address provided');
    }

    const emailDomain = emailMatch[2];
    const allowedEmail = disposable.validate(emailDomain);

    if (!allowedEmail) {
      throw new InvalidDataFormatError('Invalid email address provided');
    }

    const maybeAlreadyExistentUser = await this.usersRepository.findById(email);
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

  async requestPasswordReset(
    userRequestingResetId: string,
    redirect: string,
    url?: string
  ): Promise<any> {
    const user = await this.usersRepository.findById(userRequestingResetId);

    if (!user) {
      throw new UserNotFoundError();
    }

    const resetToken = randomBytes(256).toString('hex');

    await this.usersRepository.updateById(userRequestingResetId, {
      resetter: resetToken
    });

    await this.mailUsecase.sendResetPasswordMail(
      userRequestingResetId, 
      resetToken, 
      redirect, 
      url
    );

    return user;
  }

  /**
   * Confirms and applies the password reset
   * @param password new password
   * @param resetter token used to reset the password
   */
  async resetPassword(password: string, resetter: string) {
    const isSHA256Encoded = Buffer.from(password, 'hex').length * 8 === 256;

    if (!isSHA256Encoded) {
      throw new InvalidDataFormatError('Password must be an hex encoded SHA-256 hash');
    }

    const resetterIsHexEncoded = Buffer.from(resetter, 'hex').length === 256;

    if (!resetterIsHexEncoded) {
      throw new InvalidDataFormatError('Resetter must be an hex encoded 256 byte string');
    }

    const user = await this.usersRepository.findOne({ resetter });

    if (!user) {
      throw new UserNotFoundError();
    }

    const hashpass = createHash('sha256').update(password).digest('hex');
    const newResetter = null;

    await this.usersRepository.updateById(user.id, {
      resetter: newResetter,
      hashpass
    });

    return user;
  }

}
