import { RequestHandler, Router } from 'express';
import { HTTPGatewayController } from './controller';

export const createGatewayHTTPRouter = (
  controller: HTTPGatewayController, 
  jwtMiddleware: RequestHandler
): Router => {
  const router = Router();

  router.put('/storage/users/:uuid', jwtMiddleware, controller.changeStorage.bind(controller));
  router.delete('/storage/files', jwtMiddleware, controller.deleteFilesInBulk.bind(controller));
  
  return router;
}
