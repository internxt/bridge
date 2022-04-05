import { Request, Response } from 'express';
import { Logger } from 'winston';

import { 
  InvalidDataFormatError, 
  ResetPasswordImpersonationError, 
  UserAlreadyExistsError, 
  UserNotFoundError, 
  UsersUsecase 
} from '../../../core';

type AuthorizedRequest<T> = Request<T> & { user: { _id: string } };

export class HTTPUsersController {
  constructor(
    private usersUsecase: UsersUsecase,
    private logger: Logger
  ) {}

  async createUser(req: Request<{}, {}, { email?: string, password?: string }, {}>, res: Response) {
    if (!req.body || !req.body.email || !req.body.password) {
      return res.status(400).send();
    }
    
    const { email, password } = req.body;

    try {
      const user = await this.usersUsecase.createUser(email.toLowerCase().trim(), password);

      res.status(200).send(user);
    } catch (err) {
      if (err instanceof UserAlreadyExistsError || err instanceof InvalidDataFormatError) {
        res.status(400).send({ message: err.message });
      } else {
        // TODO: Global middleware for 500
        this.logger.error('Error creating user %s: %s. %s', email, (err as Error).message, (err as Error).stack);
      
        res.status(500).send({ message: 'Internal Server Error' });
      }
    }    
  }

}
