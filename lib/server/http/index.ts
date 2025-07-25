import { Application } from "express";
import { Logger } from "winston";

import { MongoDBBucketsRepository, MongoDBUsersRepository, UsersUsecase } from "../../core";
import { BucketsRepository } from "../../core/buckets/Repository";
import { UsersRepository } from "../../core/users/Repository";

import { Mailer, MailUsecase, Profile, SendGridMailUsecase } from "../../core/mail/usecase";
import { createUsersHTTPRouter } from "./users";
import { HTTPUsersController } from "./users/controller";
import { EventBus } from "../eventBus";
import { FramesRepository } from "../../core/frames/Repository";
import { MongoDBFramesRepository } from "../../core/frames/MongoDBFramesRepository";
import { createGatewayHTTPRouter } from "./gateway";
import { HTTPGatewayController } from "./gateway/controller";
import { GatewayUsecase } from "../../core/gateway/Usecase";
import { MirrorsRepository } from "../../core/mirrors/Repository";
import { MongoDBMirrorsRepository } from "../../core/mirrors/MongoDBMirrorsRepository";
import { PointersRepository } from "../../core/pointers/Repository";
import { MongoDBPointersRepository } from "../../core/pointers/MongoDBPointersRepository";
import { BucketEntriesRepository } from "../../core/bucketEntries/Repository";
import { MongoDBBucketEntriesRepository } from "../../core/bucketEntries/MongoDBBucketEntriesRepository";
import { buildMiddleware as buildJwtMiddleware } from "./middleware/jwt";
import { getEnv } from "../env";
import { ContactsRepository } from "../../core/contacts/Repository";
import { MongoDBContactsRepository } from "../../core/contacts/MongoDBContactsRepository";
import { ShardsRepository } from "../../core/shards/Repository";
import { MongoDBShardsRepository } from "../../core/shards/MongoDBShardsRepository";
import { BucketEntriesUsecase } from "../../core/bucketEntries/usecase";
import { ShardsUsecase } from "../../core/shards/usecase";
import { BucketEntryShardsRepository } from "../../core/bucketEntryShards/Repository";
import { MongoDBBucketEntryShardsRepository } from "../../core/bucketEntryShards/MongoDBBucketEntryShardsRepository";
import { Notifications } from "../notifications";
import { FileStateRepository } from "../../core/fileState/Repository";
import { MongoDBFileStateRepository } from "../../core/fileState/MongoDBFileStateRepository";

const { authenticate } = require('storj-service-middleware');

interface Models {
  User: any;
  Bucket: any;
  Frame: any;
  Mirror: any;
  Pointer: any;
  BucketEntry: any;
  Contact: any;
  Shard: any;
  BucketEntryShard: any;
  FileState: any;
}

export function bindNewRoutes(
  app: Application,
  storage: { models: Models },
  mailer: Mailer,
  profile: Profile,
  log: Logger,
  networkQueue: any,
  notifications: Notifications
): void {
  const { models } = storage;

  const bucketEntriesRepository: BucketEntriesRepository = new MongoDBBucketEntriesRepository(models.BucketEntry);
  const bucketEntryShardsRepository: BucketEntryShardsRepository = new MongoDBBucketEntryShardsRepository(models.BucketEntryShard);
  const bucketsRepository: BucketsRepository = new MongoDBBucketsRepository(models.Bucket);
  const usersRepository: UsersRepository = new MongoDBUsersRepository(models.User);
  const framesRepository: FramesRepository = new MongoDBFramesRepository(models.Frame);
  const mirrorsRepository: MirrorsRepository = new MongoDBMirrorsRepository(models.Mirror);
  const pointersRepository: PointersRepository = new MongoDBPointersRepository(models.Pointer);
  const contactsRepository: ContactsRepository = new MongoDBContactsRepository(models.Contact);
  const shardsRepository: ShardsRepository = new MongoDBShardsRepository(models.Shard);
  const fileStateRepository: FileStateRepository = new MongoDBFileStateRepository(models.FileState);

  const mailUsecase: MailUsecase = new SendGridMailUsecase(mailer, profile);
  const eventBus = new EventBus(log, mailUsecase, notifications);

  const usersUsecase = new UsersUsecase(
    usersRepository,
    framesRepository,
    bucketsRepository,
    mailUsecase,
    eventBus
  );

  const gatewayUsecase = new GatewayUsecase(
    bucketEntriesRepository,
    framesRepository,
    shardsRepository,
    pointersRepository,
    mirrorsRepository,
    contactsRepository,
    eventBus,
    networkQueue
  );

  const shardsUsecase = new ShardsUsecase(
    mirrorsRepository,
    contactsRepository,
    networkQueue
  );

  const bucketEntriesUsecase = new BucketEntriesUsecase(
    bucketEntriesRepository,
    bucketsRepository,
    framesRepository,
    bucketEntryShardsRepository,
    shardsRepository,
    pointersRepository,
    mirrorsRepository,
    shardsUsecase,
    usersRepository,
    fileStateRepository
  );

  const basicAuthMiddleware = authenticate(storage);
  const secretToUtf8 = Buffer.from(getEnv().gateway.jwtSecret, 'base64').toString('utf8')
  const jwtMiddleware = buildJwtMiddleware(secretToUtf8, { algorithms: ['RS256'] });

  const usersController = new HTTPUsersController(usersUsecase, log);
  const gatewayController = new HTTPGatewayController(
    gatewayUsecase,
    bucketEntriesUsecase,
    usersUsecase,
    log,
    eventBus
  );

  const usersRouter = createUsersHTTPRouter(usersController, basicAuthMiddleware);
  const gatewayRouter = createGatewayHTTPRouter(gatewayController, jwtMiddleware);

  app.use('/v2/users', usersRouter);
  app.use('/v2/gateway', gatewayRouter);
}
