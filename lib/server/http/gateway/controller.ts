import { Request, Response } from 'express';
import { Logger } from 'winston';
import { UsersUsecase } from '../../../core';
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
