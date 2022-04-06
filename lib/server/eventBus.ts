import { EventEmitter } from 'events';
import { Logger } from 'winston';
import { MailUsecase } from '../core/mail/usecase';

const { trackUserActivated } = require('../analytics');

export enum EventBusEvents {
  UserCreationStarts = 'user-creation-starts',
  UserCreationEnds = 'user-creation-ends',
  UserDestroyRequest = 'user-destroy-request'
}

interface UserCreationStartsPayload {
  email: string;
}

interface UserCreationEndsPayload {
  email: string;
  uuid: string;
}

interface UserDestroyRequestPayload {
  userRequestingDestroyEmail: string;
  mailParams: {
    deactivator: string;
    redirect: string;
  } 
}

export class EventBus extends EventEmitter {
  constructor(logger: Logger, mailer: MailUsecase) {
    super();

    this.on(EventBusEvents.UserCreationStarts, (payload: UserCreationStartsPayload) => {
      logger.info('User %s is being created', payload.email);
    });

    this.on(EventBusEvents.UserCreationEnds, (payload: UserCreationEndsPayload) => {
      logger.info('User %s has been created', payload.email);

      trackUserActivated(payload.uuid, payload.email);
    });
    
    this.on(EventBusEvents.UserDestroyRequest, (payload: UserDestroyRequestPayload) => {
      logger.info('User %s requesting destroy', payload.userRequestingDestroyEmail);

      mailer.sendDeleteUserMail(
        payload.userRequestingDestroyEmail,
        payload.mailParams.deactivator,
        payload.mailParams.redirect
      ).then(() => {
        logger.info('User destroy email sent to %s', payload.userRequestingDestroyEmail);
      }).catch((err) => {
        logger.error(
          'Error sending user destroy email to %s: %s. %s', 
          payload.userRequestingDestroyEmail,
          err.message,
          err.stack
        );
      });
    });
  }

  destroy(): void {
    this.removeAllListeners();
  }
}
