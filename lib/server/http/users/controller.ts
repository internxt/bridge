import { Request, Response } from 'express';
import { Logger } from 'winston';

import { 
  UserDeactivationDisabledError,
  UserNotFoundError, 
  UsersUsecase 
} from '../../../core';

type AuthorizedRequest<T> = Request<T> & { user: { _id: string } };

export class HTTPUsersController {
  constructor(
    private usersUsecase: UsersUsecase,
    private logger: Logger
  ) {}

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
      if (err instanceof UserDeactivationDisabledError) {
        return res.status(409).send({ error: err.message });
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

  async destroyUser(req: Request<{ token?: string }, {}, {}, { redirect?: string }>, res: Response) {
    const { token } = req.params;

    if (!token) {
      return res.status(400).send({ error: 'Missing required parameter "token"' });
    }

    try {
      const user = await this.usersUsecase.confirmDestroyUser(token);

      this.logger.info('User %s destroyed succesfully', user.id);
   
      if (req.query.redirect) {
        return res.redirect(req.query.redirect);
      } else {
        res.status(200).send({ message: 'Deleted' });
      }
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return res.status(404).send({ error: err.message });
      }
      this.logger.error(
        'Error destroying user with deactivator %s: %s. %s', 
        token,
        (err as Error).message,
        (err as Error).stack
      );

      return res.status(500).send({ error: 'Internal Server Error' });
    }    
  }
}
