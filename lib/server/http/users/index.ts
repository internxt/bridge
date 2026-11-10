import { RequestHandler, Router } from 'express';
import { HTTPUsersController } from './controller';

export const createUsersHTTPRouter = (
  controller: HTTPUsersController, 
  basicAuth: RequestHandler | RequestHandler[]
): Router => {
  const router = Router();

  router.delete('/request-deactivate', basicAuth, controller.requestDestroyUser.bind(controller));
  router.delete('/confirm-deactivate/:token', controller.destroyUser.bind(controller));

  return router;
}
