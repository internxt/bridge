import { Request, Response } from 'express';
import { validate as uuidValidate } from 'uuid';
import { Logger } from 'winston';
import { EmailIsAlreadyInUseError, InvalidDataFormatError, UserAlreadyExistsError, UserNotFoundError, UserSpaceSnapshot, UsersUsecase } from '../../../core';
import { BucketEntriesUsecase } from '../../../core/bucketEntries/usecase';
import { BucketNotFoundError } from '../../../core/buckets/usecase';

import { GatewayUsecase } from '../../../core/gateway/Usecase';
import { EventBus, EventBusEvents, UserStorageChangedPayload } from '../../eventBus';

type DeleteFilesInBulkResponse = {
  message: {
    confirmed: string[]
    notConfirmed: string[]
  } | string
};

type CreateBucketBody = { name: string };
type CreateBucketResponse = { id: string; name: string };

type CreateBucketEntryBody = { size: number };
type CreateBucketEntryResponse = UserSpaceSnapshot & { id: string };

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

const isValidEntrySize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export class HTTPGatewayController {
  constructor(
    private gatewayUsecase: GatewayUsecase, 
    private bucketEntriesUsecase: BucketEntriesUsecase,
    private usersUsecase: UsersUsecase,
    private logger: Logger,
    private eventBus: EventBus
  ) {}

  async getUserUsage(
    req: Request<{ uuid: string }, {}, {}, {}>,
    res: Response<UserSpaceSnapshot | { message: string }>
  ) {
    const { uuid } = req.params;

    if (!uuid || !uuidValidate(uuid)) {
      return res.status(400).send({ message: 'Missing or invalid uuid' });
    }

    try {
      const usage = await this.usersUsecase.getUserUsage(uuid);

      return res.status(200).send(usage);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return res.status(404).send({ message: err.message });
      }

      this.logger.error(
        '[GATEWAY/GET_USAGE] Error getting usage of user %s: %s. %s',
        uuid,
        (err as Error).message,
        (err as Error).stack || 'NO STACK'
      );

      return res.status(500).send({ message: 'Internal server error' });
    }
  }

  async updateUserEmail(req: Request<{ uuid: string }, {}, { email?: string }, {}>, res: Response) {
    if (!(req.body && req.body.email && req.params.uuid)) {
      return res.status(400).send({ error: "Missing params" });
    }

    try {
      const { email } = req.body;
      const { uuid } = req.params;

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
        req.params.uuid, 
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

  async createUserBucket(
    req: Request<{ uuid: string }, {}, Partial<CreateBucketBody>, {}>,
    res: Response<CreateBucketResponse | { message: string }>
  ) {
    const { uuid } = req.params;
    const { name } = req.body;

    if (!uuid || typeof name !== 'string' || name.length === 0) {
      return res.status(400).send({ message: 'name is required' });
    }

    try {
      const bucket = await this.usersUsecase.findOrCreateBucket(uuid, name);

      return res.status(200).send(bucket);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return res.status(404).send({ message: err.message });
      }

      this.logger.error(
        '[GATEWAY/CREATE_BUCKET] Error creating bucket for user %s: %s. %s',
        uuid,
        (err as Error).message,
        (err as Error).stack || 'NO STACK'
      );

      return res.status(500).send({ message: 'Internal server error' });
    }
  }

  async createBucketEntry(
    req: Request<{ uuid: string; id: string }, {}, Partial<CreateBucketEntryBody>, {}>,
    res: Response<CreateBucketEntryResponse | { message: string }>
  ) {
    const { uuid, id } = req.params;
    const { size } = req.body;

    if (!uuid || !id || !OBJECT_ID_PATTERN.test(id)) {
      return res.status(400).send({ message: 'Invalid params' });
    }

    if (!isValidEntrySize(size)) {
      return res
        .status(400)
        .send({ message: 'size must be a positive integer' });
    }

    try {
      const { id: entryId, snapshot } = await this.bucketEntriesUsecase.createEntry(
        uuid,
        id,
        size
      );

      return res.status(200).send({ id: entryId, ...snapshot });
    } catch (err) {
      if (err instanceof UserNotFoundError || err instanceof BucketNotFoundError) {
        return res.status(404).send({ message: err.message });
      }

      this.logger.error(
        '[GATEWAY/CREATE_ENTRY] Error creating entry on bucket %s of user %s: %s. %s',
        id,
        uuid,
        (err as Error).message,
        (err as Error).stack || 'NO STACK'
      );

      return res.status(500).send({ message: 'Internal server error' });
    }
  }

  async deleteBucketEntry(
    req: Request<{ uuid: string; id: string; entryId: string }>,
    res: Response<UserSpaceSnapshot | { message: string }>
  ) {
    const { uuid, id, entryId } = req.params;

    if (!uuid || !id || !OBJECT_ID_PATTERN.test(id) || !OBJECT_ID_PATTERN.test(entryId)) {
      return res.status(400).send({ message: 'Invalid params' });
    }

    try {
      const snapshot = await this.bucketEntriesUsecase.removeEntry(uuid, id, entryId);

      return res.status(200).send(snapshot);
    } catch (err) {
      if (err instanceof UserNotFoundError || err instanceof BucketNotFoundError) {
        return res.status(404).send({ message: err.message });
      }

      this.logger.error(
        '[GATEWAY/DELETE_ENTRY] Error deleting entry on bucket %s of user %s: %s. %s',
        id,
        uuid,
        (err as Error).message,
        (err as Error).stack || 'NO STACK'
      );

      return res.status(500).send({ message: 'Internal server error' });
    }
  }
}
