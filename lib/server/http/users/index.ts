import { Router } from 'express';
import { HTTPUsersController } from './controller';

export const createUsersHTTPRouter = (controller: HTTPUsersController): Router => {
  const router = Router();

  router.delete('/confirm-deactivate/:token', controller.destroyUser.bind(controller));

  return router;
}
