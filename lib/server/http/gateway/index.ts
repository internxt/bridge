import { RequestHandler, Router } from 'express';
import { HTTPGatewayController } from './controller';

export const createGatewayHTTPRouter = (
  controller: HTTPGatewayController, 
  jwtMiddleware: RequestHandler
): Router => {
  const router = Router();

  router.post('/users', jwtMiddleware, controller.findOrCreateUser.bind(controller));
  router.put('/users/:uuid', jwtMiddleware, controller.updateUser.bind(controller));
  router.put('/storage/users/:uuid', jwtMiddleware, controller.changeStorage.bind(controller));
  router.delete('/storage/files', jwtMiddleware, controller.deleteFilesInBulk.bind(controller));
  
  return router;
}
