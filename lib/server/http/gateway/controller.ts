import { Request, Response } from 'express';
import { Logger } from 'winston';
import { BucketEntriesUsecase } from '../../../core/bucketEntries/usecase';

import { GatewayUsecase } from '../../../core/gateway/Usecase';

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
    private logger: Logger
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
}
