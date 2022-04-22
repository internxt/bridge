#!/usr/bin/env node

'use strict';

import { config as loadEnv } from 'dotenv';
import mysql from 'mysql';
import Config from '../../lib/config';
import { driveRepository } from './database';
import { removeFileAndEnqueueDeletionTask } from '../../lib/server/services/files';
import NetworkMessageQueue from '../../lib/server/queues/networkQueue';

const Storage = require('storj-service-storage-models') as any;

loadEnv();

// This script is to be run as a cron job
// Unlike all the other cleaner scripts it is not to be run as a command but as a single script
// It does not use the command line arguments
// It takes the parameters it needs from environment variables

if (!process.env.NODE_ENV) {
  throw new Error('NODE_ENV is not set');
}

// RDS_URL is a sql connection string 
if (!process.env.RDS_URL) {
  throw new Error('RDS_CONNECTION_STRING env missing');
}

// MONGO_URL is a mongo connection string 
if (!process.env.MONGO_URL) {
  throw new Error('MONGO_URL env missing');
}

// QUEUE_URL is a amqp connection string
if (!process.env.QUEUE_URL) {
  throw new Error('QUEUE_URL env missing');
}

const { NODE_ENV, RDS_URL, MONGO_URL, QUEUE_URL, CONFIG_PATH, QUEUE_NAME} = process.env;

const DEFAULT_QUEUE_NAME = 'NETWORK_WORKER_TASKS_QUEUE';

const networkQueue = new NetworkMessageQueue({
  connection: {
    url: QUEUE_URL,
  },
  exchange: {
    name: 'exchangeName',
    type: 'direct',
  },
  queue: {
    name: QUEUE_NAME || DEFAULT_QUEUE_NAME,
  },
  routingKey: {
    name: 'routingKeyName',
  },
});

const sqlPool = mysql.createPool(RDS_URL);
const drive = driveRepository(sqlPool);
const config = new Config(NODE_ENV, CONFIG_PATH, '') as {
  storage: { mongoUrl: string; mongoOpts: any };
};

console.log('MONGO_URL', MONGO_URL);
console.log('RDS_URL: ', RDS_URL);
console.log('QUEUE_URL: ', QUEUE_URL);

const storage = new Storage(
  MONGO_URL || config.storage.mongoUrl,
  config.storage.mongoOpts,
  null
);

let deletedFilesCount = 0;

async function deletePendingFiles() {
  let filesBatchSize = 5;
  let lastFilesCount = 0;

  let currentFile;

  try {
    await networkQueue.init();
    do {
      const filesToDelete = await drive.getDeletedFiles(filesBatchSize);
      for (const file of filesToDelete) {
        currentFile = file;
        const { bucket: bucketId, file_id:idFile, user_email:userEmail } = file;
        await removeFileAndEnqueueDeletionTask(
          storage,
          networkQueue,
          { bucketId, userEmail, idFile }
        );
        await drive.deleteReferenceToDeletedFile(idFile);
        deletedFilesCount += 1;
      }

      lastFilesCount = filesToDelete.length;
    } while (lastFilesCount === filesBatchSize);

    console.log('Deleted files: ', deletedFilesCount);
  } catch (err) {
    console.log(err);
    if (currentFile) {
      console.log(
        'Error removing file %s: %s',
        (currentFile as any).file_id,
        (err as Error).message
      );
    }
    console.error((err as Error).stack);
  } finally {
    console.log(
      'Program finished. %s files deleted',
      deletedFilesCount
    );
    if (currentFile) {
      console.log(
        'Last file deleted: %s ',
        (currentFile as any).file_id
      );
    }
    sqlPool.end();
    storage.connection.close();
    await networkQueue.close();
  }
}

deletePendingFiles(); 
