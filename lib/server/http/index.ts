import { Application } from "express";

import { MongoDBBucketsRepository, MongoDBUsersRepository, UsersUsecase } from "../../core";
import { BucketsRepository } from "../../core/buckets/Repository";
import { UsersRepository } from "../../core/users/Repository";

import { Mailer, MailUsecase, Profile, SendGridMailUsecase } from "../../core/mail/usecase";
import { createUsersHTTPRouter } from "./users";
import { HTTPUsersController } from "./users/controller";
import { EventBus } from "../eventBus";
import { Logger } from "winston";
import { FramesRepository } from "../../core/frames/Repository";
import { MongoDBFramesRepository } from "../../core/frames/MongoDBFramesRepository";

const { authenticate } = require('storj-service-middleware');

interface Models {
  User: any;
  Bucket: any;
  Frame: any;
}

export function bindNewRoutes(
  app: Application, 
  storage: { models: Models }, 
  mailer: Mailer, 
  profile: Profile,
  log: Logger
): void {
  const { models } = storage;
  const bucketsRepository: BucketsRepository = new MongoDBBucketsRepository(models.Bucket);
  const usersRepository: UsersRepository = new MongoDBUsersRepository(models.User);
  const framesRepository: FramesRepository = new MongoDBFramesRepository(models.Frame);

  const mailUsecase: MailUsecase = new SendGridMailUsecase(mailer, profile);
  const eventBus = new EventBus(log, mailUsecase);

  const usersUsecase = new UsersUsecase(
    usersRepository, 
    framesRepository,
    bucketsRepository, 
    mailUsecase,
    eventBus
  );

  const basicAuthMiddleware = authenticate(storage);
  const usersController = new HTTPUsersController(usersUsecase, log);

  const usersRouter = createUsersHTTPRouter(usersController, basicAuthMiddleware);

  app.use('/v2/users', usersRouter);
}
