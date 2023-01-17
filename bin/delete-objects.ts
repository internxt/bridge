import AWS from 'aws-sdk';
import { validate } from 'uuid';
import program from 'commander';

import { connectToDatabase, Models } from './utils/database';

interface StorageObject {
  Key: string;
  Size: number;
}

program
  .version('0.0.1')
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
  .parse(process.argv);

const bucket = program.bucket;
const endpoint = program.endpoint;
const region = program.region;
const accessKey = program.accessKey;
const secretAccessKey = program.secretAccessKey;

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
 * Returns a list of objects in the bucket
 * @returns list of objects in the bucket (1000 max)
 */
async function listObjects(lastPointer?: string): Promise<{ objects: StorageObject[], pointer: string }> {
  const data = await s3.listObjectsV2({ Bucket: bucket, ContinuationToken: lastPointer }).promise();
  const list = data.Contents;
  const pointer = data.ContinuationToken || '';
  const objects: StorageObject[] = list?.map(({ Key, Size }) => ({ Size: Size || 0, Key: Key || '' })) || [];

  return { objects, pointer };
}

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
    models = await connectToDatabase(program.config, program.mongourl);
    connected = true;
  }

  const shard: any | null = await models?.Shard.findOne({ uuid: key });

  if (shard) return true;
  else return false;
}

async function main(): Promise<void> {
  let totalDeletedSize = 0;
  let totalDeletedObjects = 0;

  let objects: StorageObject[] = [];
  let pointer = '';

  do {
    const listObjectsRes = await listObjects(pointer);
    objects = listObjectsRes.objects;
    pointer = listObjectsRes.pointer;

    const objectsToDelete: StorageObject['Key'][] = [];

    // check if the object is in the database
    for (const object of objects) {
      const isUUID = validate(object.Key);
      if (isUUID) {
        // if uses UUID, uses API v2, therefore the key can be checked against database
        const isInTheDatabase: boolean = await checkIfObjectIsInTheDatabase(object.Key);

        if (!isInTheDatabase) {
          console.log('Key', object.Key, 'is not in the database');
          totalDeletedSize += object.Size;
          objectsToDelete.push(object.Key);
        }
      }
    }

    if (objectsToDelete.length > 0) {
      await deleteObjects(objectsToDelete);
      totalDeletedObjects += objectsToDelete.length;
    } 

    console.log('Deleted', totalDeletedObjects, 'objects');
    console.log('Deleted', totalDeletedSize, 'bytes');
  } while (objects.length > 0);

  await insertStatsOnDatabase(totalDeletedSize);  
}

async function insertStatsOnDatabase(deletedSize: number) {
  // TODO
  console.log(`PROGRAM FINISHED. DELETED ${deletedSize} bytes`);
}

main().then(() => console.log('done')).catch(console.error);

