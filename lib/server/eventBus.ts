import { EventEmitter } from 'events';
import { Logger } from 'winston';
import { MailUsecase } from '../core/mail/usecase';
import { Notifications } from './notifications';
import { User } from '../core/users/User';

const { trackUserActivated } = require('../analytics');

export enum EventBusEvents {
  UserCreationStarts = 'user-creation-starts',
  UserCreationEnds = 'user-creation-ends',
  UserDestroyRequest = 'user-destroy-request',
  FilesBulkDeleteFailed = 'files-bulk-delete-failed',
  UserStorageChanged = 'user-storage-changed',
}

interface UserCreationStartsPayload {
  email: User['email'];
}

interface UserCreationEndsPayload {
  email: User['email'];
  uuid: User['id'];
}

interface UserDestroyRequestPayload {
  userRequestingDestroyEmail: User['email'];
  mailParams: {
    deactivator: string;
    redirect: string;
  };
}

interface FilesBulkDeleteFailedPayload {
  err: Error;
  fileIds: string;
}

export interface UserStorageChangedPayload {
  limit: number;
  idUser: string;
}

export class EventBus extends EventEmitter {
  constructor(
    logger: Logger,
    mailer: MailUsecase,
    notifications: Notifications
  ) {
    super();

    this.on(
      EventBusEvents.UserCreationStarts,
      (payload: UserCreationStartsPayload) => {
        logger.info('User %s is being created', payload.email);
      }
    );

    this.on(
      EventBusEvents.UserCreationEnds,
      (payload: UserCreationEndsPayload) => {
        logger.info('User %s has been created', payload.email);

        trackUserActivated(payload.uuid, payload.email);
      }
    );

    this.on(
      EventBusEvents.UserDestroyRequest,
      (payload: UserDestroyRequestPayload) => {
        logger.info(
          'User %s requesting destroy',
          payload.userRequestingDestroyEmail
        );

        mailer
          .sendDeleteUserMail(
            payload.userRequestingDestroyEmail,
            payload.mailParams.deactivator,
            payload.mailParams.redirect
          )
          .then(() => {
            logger.info(
              'User destroy email sent to %s',
              payload.userRequestingDestroyEmail
            );
          })
          .catch((err) => {
            logger.error(
              'Error sending user destroy email to %s: %s. %s',
              payload.userRequestingDestroyEmail,
              err.message,
              err.stack
            );
          });
      }
    );

    this.on(
      EventBusEvents.FilesBulkDeleteFailed,
      ({ err, fileIds }: FilesBulkDeleteFailedPayload) => {
        logger.error(
          'Files bulk delete failed: %s. %s. File ids: %s',
          err.message,
          err.stack || 'NO STACK',
          fileIds
        );
      }
    );

    this.on(
      EventBusEvents.UserStorageChanged,
      ({ idUser, limit }: UserStorageChangedPayload) => {
        logger.info('User %s storage changed to %s', idUser, limit);
        notifications.storageChanged(idUser, limit);
      }
    );
  }

  destroy(): void {
    this.removeAllListeners();
  }
}
