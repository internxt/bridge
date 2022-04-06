import { Request, Response } from 'express';
import { Logger } from 'winston';

import { 
  InvalidDataFormatError, 
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

  async resetPassword(
    req: Request<{ token?: string }, {}, { password?: string }>, 
    res: Response
  ): Promise<any> {
    const { token } = req.params;
    const { password } = req.body;

    try {
      if (!token || !password) {
        return res.status(400).send();
      }

      const user = await this.usersUsecase.resetPassword(password, token);

      res.status(200).send(JSON.stringify(user));
    } catch (err) {
      if (err instanceof InvalidDataFormatError) {
        return res.status(400).send({ message: err.message });
      }

      if (err instanceof UserNotFoundError) {
        return res.status(404).send();
      }

      this.logger.error(
        'Error resetting password for token %s: %s. %s', 
        token, 
        (err as Error).message, 
        (err as Error).stack
      );

      return res.status(500).send();
    }    
  }

  async requestPasswordReset(
    req: Request<{ id: string }, {}, { redirect?: string, url?: string }>, 
    res: Response
  ) {
    if (!req.body || !req.body.redirect) {
      return res.status(400).send();
    }

    const { id: userId } = req.params;
    const { redirect, url } = req.body;

    try {
      const user = await this.usersUsecase.requestPasswordReset(userId, redirect, url);

      return res.status(200).send(JSON.stringify(user));
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return res.status(404).send();
      }

      this.logger.error(
        'Error requesting password reset for user %s: %s. %s', 
        (req as AuthorizedRequest<any>).user._id, 
        (err as Error).message, 
        (err as Error).stack
      );

      return res.status(500).send({ message: 'Internal Server Error' });
    }
  }

  async requestDestroyUser(
    req: Request<{}, {}, {}, { deactivator?: string, redirect?: string }>, 
    res: Response
  ) {
    const { deactivator, redirect } = req.query;
    const userId = (req as AuthorizedRequest<any>).user._id;

    if (!deactivator || !redirect) {
      return res.status(400).send({ error: 'Missing required params' });
    }

    try {
      const userRequestedToBeDestroyed = await this.usersUsecase.requestUserDestroy(
        userId, 
        deactivator, 
        redirect
      );
      
      return res.status(200).send(userRequestedToBeDestroyed);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return res.status(404).send({ error: err.message });
      }
      this.logger.error(
        'Error requesting user destroy for user %s: %s. %s',
        (req as AuthorizedRequest<any>).user._id,
        (err as Error).message, 
        (err as Error).stack
      )
      return res.status(500).send({ error: 'Internal Server Error' });
    }
  }
}
