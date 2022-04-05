import { RequestHandler, Router } from 'express';
import { HTTPUsersController } from './controller';

export const createUsersHTTPRouter = (
  controller: HTTPUsersController, 
  basicAuth: RequestHandler
): Router => {
  const router = Router();

  router.post('/', controller.createUser.bind(controller));
  
  router.post('/:id/request-password-reset', controller.requestPasswordReset.bind(controller));
  router.post('/confirm-password-reset/:token', controller.resetPassword.bind(controller));

  return router;
}
