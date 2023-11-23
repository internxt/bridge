import { Request, Response } from 'express';
import { Logger } from 'winston';
import { EmailIsAlreadyInUseError, InvalidDataFormatError, UserAlreadyExistsError, UserNotFoundError, UsersUsecase } from '../../../core';
import { BucketEntriesUsecase } from '../../../core/bucketEntries/usecase';

import { GatewayUsecase } from '../../../core/gateway/Usecase';
import { EventBus, EventBusEvents, UserStorageChangedPayload } from '../../eventBus';

type DeleteFilesInBulkResponse = {
  message: {
    confirmed: string[]
    notConfirmed: string[]
  } | string
};

export class HTTPGatewayController {
  constructor(
    private gatewayUsecase: GatewayUsecase, 
    private bucketEntriesUsecase: BucketEntriesUsecase,
    private usersUsecase: UsersUsecase,
    private logger: Logger,
    private eventBus: EventBus
  ) {}

  async updateUserEmail(req: Request<{}, {}, { email?: string, uuid: string }, {}>, res: Response) {
    if (!req.body || !req.body.email || !req.body.uuid) {
      return res.status(400).send();
    }

    try {
      const { email, uuid } = req.body;

      await this.usersUsecase.updateEmail(uuid, email);

      res.status(200).send();
    } catch (error) {
      const err = error as Error;

      if (err instanceof UserNotFoundError) {
        return res.status(404).send({ message: err.message });
      }
      if (err instanceof EmailIsAlreadyInUseError) {
        return res.status(409).send({ message: err.message });
      }
      this.logger.error(
        '[GATEWAY/UPDATE_EMAIL] Error updating user %s email: %s. %s', 
        req.body.uuid, 
        err.message, 
        err.stack
      );
    
      res.status(500).send({ message: 'Internal Server Error' });
    }
  }

  async findOrCreateUser(req: Request<{}, {}, { email?: string, password?: string }, {}>, res: Response) {
    if (!req.body || !req.body.email || !req.body.password) {
      return res.status(400).send();
    }

    const { email, password } = req.body;

    try {
      const user = await this.usersUsecase.findOrCreateUser(email.toLowerCase().trim(), password);

      res.status(200).send(user);
    } catch (err) {
      if (err instanceof UserAlreadyExistsError || err instanceof InvalidDataFormatError) {
        res.status(400).send({ message: err.message });
      } else {
        this.logger.error('[GATEWAY/USER] Error for user %s: %s. %s', email, (err as Error).message, (err as Error).stack);
      
        res.status(500).send({ message: 'Internal Server Error' });
      }
    }
  }

  async deleteFilesInBulk(
    req: Request<{}, {}, { files?: unknown | string[] }, {}>, 
    res: Response<DeleteFilesInBulkResponse>
  ) {
    const files = req.body.files;
    const isArray = files instanceof Array;

    if (!files || !isArray) {
      return res.status(400).send();
    }

    if (files.some(f => typeof f !== 'string')) {
      return res.status(400).send();
    }

    try {
      const result = await this.bucketEntriesUsecase.removeFiles(files);

      res.status(200).send({
        message: {
          confirmed: result,
          notConfirmed: []
        }
      });
    } catch (err) {
      this.logger.error('Error deleting files in bulk %s: %s. %s', files, (err as Error).message, (err as Error).stack);
      
      res.status(500).send({ message: 'Internal Server Error' });
    }    
  }

  async changeStorage(
    req: Request<{ uuid: string }, {}, { bytes?: string }, {}>, 
    res: Response<{ message: string }>
  ) {
    if (!req.body.bytes) {
      return res.status(400).send({ message: 'Missing required params' });
    }
    try {
      const { uuid} = req.params;
      const { bytes } = req.body;

      await this.usersUsecase.updateUserStorage(uuid, parseInt(bytes));

      const eventPayload: UserStorageChangedPayload = { idUser: uuid, limit: parseInt(bytes) };
      this.eventBus.emit(EventBusEvents.UserStorageChanged, eventPayload);

      res.status(200).send();
    } catch (err) {
      this.logger.error('GATEWAY: changeStorage error: %s. %s', (err as Error).message, (err as Error).stack || 'NO STACK');

      return res.status(500).send({ message: 'Internal server error' });
    }
  }
}
