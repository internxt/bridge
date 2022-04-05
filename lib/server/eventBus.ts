import { EventEmitter } from 'events';
import { Logger } from 'winston';

const { trackUserActivated } = require('../analytics');

export enum EventBusEvents {
  UserCreationStarts = 'user-creation-starts',
  UserCreationEnds = 'user-creation-ends'
}

interface UserCreationStartsPayload {
  email: string;
}

interface UserCreationEndsPayload {
  email: string;
  uuid: string;
}

export class EventBus extends EventEmitter {
  constructor(logger: Logger) {
    super();

    this.on(EventBusEvents.UserCreationStarts, (payload: UserCreationStartsPayload) => {
      logger.info('User %s is being created', payload.email);
    });

    this.on(EventBusEvents.UserCreationEnds, (payload: UserCreationEndsPayload) => {
      logger.info('User %s has been created', payload.email);

      trackUserActivated(payload.uuid, payload.email);
    });
  }

  destroy(): void {
    this.removeAllListeners();
  }
}
