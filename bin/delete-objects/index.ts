import AWS from 'aws-sdk';
import { validate } from 'uuid';
import { program } from 'commander';

import { connectToDatabase, Models } from '../utils/database';
import { 
  FileListObjectStorageReader, 
  ObjectStorageReader, 
  S3ObjectStorageReader, 
  StorageObject 
} from './ObjectStorage';

program
  .version('0.0.1')
  .option(
    '-f, --filename <file_name>',
    'file name with the list of objects'
  )
  .option(
    '-u, --mongourl <mongo connection string>',
    'mongo url connection string'
  )
  .option(
    '-b, --bucket <my_bucket>',
    'object storage bucket'
  )
  .option(
    '-s, --secret-access-key <some_key>',
    'object storage secret access key'
  )
  .option(
    '-a, --access-key <some_key>',
    'object storage access key'
  )
  .option(
    '-e, --endpoint <s3.something.com>',
    'object storage endpoint'
  )
  .option(
    '-r, --region <us-east-1>',
    'object storage region'
  )
  .parse();


const options = program.opts();
const bucket = options.bucket;
const endpoint = options.endpoint;
const region = options.region;
const accessKey = options.accessKey;
const secretAccessKey = options.secretAccessKey;

console.log('PARAMS', { bucket, endpoint, region, accessKey, secretAccessKey });
const s3 = new AWS.S3({
  endpoint,
  signatureVersion: 'v4',
  region,
  s3ForcePathStyle: true,
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey
  },
});

/**
 * Deletes a list of objects using keys
 * @param keys list of keys to delete
 */
async function deleteObjects(keys: string[]): Promise<void> {
  await s3.deleteObjects({
    Bucket: bucket,
    Delete: {
      Objects: keys.map(Key => ({ Key }))
    }
  }).promise();
} 

let connected = false;
let models: Models | null = null;
async function checkIfObjectIsInTheDatabase(key: StorageObject['Key']): Promise<boolean> {
  if (!connected) {
    models = await connectToDatabase(options.config, options.mongourl);
    connected = true;
  }

  const shard: any | null = await models?.Shard.findOne({ uuid: key });

  if (shard) return true;
  else return false;
}

const readerSource = options.filename ? 'file' : 's3';
let objectStorageReader: ObjectStorageReader;

if (readerSource === 'file') {
  objectStorageReader = new FileListObjectStorageReader(options.filename);
} else {
  objectStorageReader = new S3ObjectStorageReader(
    endpoint,
    region,
    accessKey,
    secretAccessKey,
    bucket,
  );
}

const stats = {
  totalDeletedSize: 0,
  totalDeletedObjects: 0,
};

async function cleanStalledObjects(): Promise<void> {
  let objectsToDelete: StorageObject['Key'][] = [];

  for await (const object of objectStorageReader.listObjects(1000)) {
    const isUUID = validate(object.Key);

    if (isUUID) {
      // if uses UUID, uses API v2, therefore the key can be checked against database
      const isInTheDatabase: boolean = await checkIfObjectIsInTheDatabase(object.Key);

      if (!isInTheDatabase) {
        console.log('Key', object.Key, 'is not in the database | Date: ', object.LastModified.toISOString());
        stats.totalDeletedSize += object.Size;
        stats.totalDeletedObjects += 1;
        objectsToDelete.push(object.Key);
      }
    }

    if (objectsToDelete.length >= 100) {
      await deleteObjects(objectsToDelete);
      objectsToDelete = [];
    }
  }  

  if (objectsToDelete.length > 0) {
    await deleteObjects(objectsToDelete);
  }
}

/**
 * Clean unfinished multipart uploads. 
 * Still WIP
 */
async function cleanUnfinishedMultiparts(): Promise<void> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  for await (const object of objectStorageReader.listObjects(1000)) {
    const isUUID = validate(object.Key);
    const isOlderThanSevenDays = object.LastModified < sevenDaysAgo;

    if (isUUID && isOlderThanSevenDays) {
      // if uses UUID, uses API v2, therefore the key can be checked against database
      const isInTheDatabase: boolean = await checkIfObjectIsInTheDatabase(object.Key);

      if (!isInTheDatabase) {
        console.log('Key', object.Key, 'is not in the database | Date: ', object.LastModified.toISOString());
        stats.totalDeletedSize += object.Size;
        stats.totalDeletedObjects += 1;
        // await deleteObjects([object.Key]);
      }
    }
  } 
}

async function insertStatsOnDatabase(deletedSize: number) {
  // TODO
  console.log(`PROGRAM FINISHED. DELETED ${deletedSize} bytes`);
}

async function main(): Promise<void> {
  const logInterval = setInterval(() => {
    console.log('STATS', stats);
  }, 10000);
  try {
    await cleanStalledObjects();
    await insertStatsOnDatabase(stats.totalDeletedSize);
    
    console.log('PROGRAM FINISHED SUCCESSFULLY');
  } catch (error) {
    console.error(error);
  } finally {
    clearInterval(logInterval);
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
