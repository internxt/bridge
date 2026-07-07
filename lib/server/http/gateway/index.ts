import { RequestHandler, Router } from 'express';
import { HTTPGatewayController } from './controller';

export const createGatewayHTTPRouter = (
  controller: HTTPGatewayController, 
  jwtMiddleware: RequestHandler
): Router => {
  const router = Router();

  router.post('/users', jwtMiddleware, controller.findOrCreateUser.bind(controller));
  router.patch('/users/:uuid', jwtMiddleware, controller.updateUserEmail.bind(controller));
  router.put('/storage/users/:uuid', jwtMiddleware, controller.changeStorage.bind(controller));
  router.post('/users/:uuid/buckets', jwtMiddleware, controller.createUserBucket.bind(controller));
  router.post('/users/:uuid/buckets/:id/entries', jwtMiddleware, controller.createBucketEntry.bind(controller));
  router.delete('/users/:uuid/buckets/:id/entries/:entryId', jwtMiddleware, controller.deleteBucketEntry.bind(controller));
  router.delete('/storage/files', jwtMiddleware, controller.deleteFilesInBulk.bind(controller));
  
  return router;
}
