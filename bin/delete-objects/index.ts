import AWS from 'aws-sdk';
import { validate } from 'uuid';
import { program } from 'commander';
import { MongoDBShardsRepository } from '../../lib/core/shards/MongoDBShardsRepository';
import { connectToDatabase, Models } from '../utils/database';
import { 
  DatabaseShardsReader,
  FileListObjectStorageReader, 
  ObjectStorageReader, 
  ripemd160, 
  S3ObjectStorageReader, 
  StorageObject 
} from './ObjectStorage';
import listV1Shards from './list-v1-shards';

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
  .option(
    '-n, --nodeId <node-id>',
    'the node id of the farmer that has a contract with the shards to filter'
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
  throughput: 0,
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

const createTimer = () => {
  let timeStart: [number, number];

  return {
    start: () => {
      timeStart = process.hrtime();
    },
    end: () => {
      const NS_PER_SEC = 1e9;
      const NS_TO_MS = 1e6;
      const diff = process.hrtime(timeStart);

      return (diff[0] * NS_PER_SEC + diff[1]) / NS_TO_MS;
    }
  };
};

/**
 * TODO: Add the cleanup part
 */
async function cleanStalledV1Objects(): Promise<void> {
  console.log('nodeId', options.nodeId);

  models = await connectToDatabase(options.config, options.mongourl);
  const shardsReader = new DatabaseShardsReader(new MongoDBShardsRepository(models?.Shard));

  const timer = createTimer();
  timer.start();
  const listingEmitter = listV1Shards(shardsReader, options.nodeId);

  await new Promise((resolve, reject) => {
    listingEmitter
      .once('error', reject)
      .once('end', resolve)
      .on('progress', ({ deletedCount }) => {
        stats.throughput = deletedCount / (timer.end() / 1000)
      })
      .on('data', (shard) => {
        console.log('shard %s %s %s', shard.hash, ripemd160(shard.hash), shard.size);
      })
  });
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
    // await cleanStalledObjects();
    await cleanStalledV1Objects();
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
