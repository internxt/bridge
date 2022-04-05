import { RequestHandler, Router } from 'express';
import { HTTPUsersController } from './controller';

export const createUsersHTTPRouter = (
  controller: HTTPUsersController, 
  basicAuthMd: RequestHandler
): Router => {
  const router = Router();

  router.post('/', controller.createUser.bind(controller));
  

  return router;
}
