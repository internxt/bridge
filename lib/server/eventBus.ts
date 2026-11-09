import { EventEmitter } from 'events';
import { Logger } from 'winston';
import { Notifications } from './notifications';
import { User } from '../core/users/User';

const { trackUserActivated } = require('../analytics');

export enum EventBusEvents {
  UserCreationStarts = 'user-creation-starts',
  UserCreationEnds = 'user-creation-ends',
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
