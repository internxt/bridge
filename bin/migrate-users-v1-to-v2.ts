import program from 'commander';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { config as loadEnv } from 'dotenv';
import axios from 'axios';
import Config from '../lib/config';
import { iterateOverCursor } from './cleaner/database';

const Storage = require('storj-service-storage-models') as any;

loadEnv();

// Example:
// ts-node bin/migrate-v1-to-v2.ts \
// -e fabioespinosa@hotmail.com \ 
// -u mongodb://admin:password@localhost:27017/__inxt-network 

program
  .version('0.0.1')
  .option('-c, --config <path_to_config_file>', 'path to the config file')
  .option('-e, --email <user email>', 'user email to migrate')
  .option('-u, --mongourl <mongo connection string>', 'mongo url connection string')
  .parse(process.argv);

if (!process.env.NODE_ENV) {
  throw new Error('NODE_ENV is not set');
}

if (!process.env.XNODES) {
  throw new Error('XNODES env is not set');
}

if (!program.mongourl) {
  throw new Error('Add the mongo connection string as -u or --mongourl');
}

if (!program.email) {
  throw new Error('Add the user email as -e or --email');
}

const S3BucketName = '';
const S3Endpoint = '';
const S3AccessKeyId = '';
const S3SecretAccessKey = ''
const S3Region = ''

const S3Bucket = new AWS.S3({
  endpoint: new AWS.Endpoint(S3Endpoint),
  credentials: new AWS.Credentials({
    accessKeyId: S3AccessKeyId,
    secretAccessKey: S3SecretAccessKey,
  }),
  signatureVersion: 'v4',
  region: S3Region,
});

let idBucketBeingChecked: string;
let migratedBuckets = 0;
let checkedBuckets = 0;

const config = new Config(process.env.NODE_ENV, program.config, '') as {
  storage: { mongoUrl: string; mongoOpts: any };
  nodes: { username: string, password: string };
};
const storage = new Storage(
  program.mongourl || config.storage.mongoUrl,
  config.storage.mongoOpts
);

const XNODES: string[] = JSON.parse(process.env.XNODES);

const {
  Bucket: BucketModel,
  BucketEntry: BucketEntryModel,
  BucketEntryShard: BucketEntryShardModel,
  Contact: ContactModel,
  Mirror: MirrorModel,
} = storage.models;

const logStatus = () => {
  console.log('Deleted buckets: ', migratedBuckets);
  console.log('Checked buckets: ', checkedBuckets);
  if (idBucketBeingChecked) {
    console.log('Id of last bucket checked: ', idBucketBeingChecked);
  }
};

const loggerInterval = setInterval(logStatus, 4000);

const getDownloadUrl = async (shard: any) => {
  const mirror = await MirrorModel
    .findOne({ shardHash: shard.hash })
    .populate('contact');
  
  const { contact } = mirror;
  const { address, port } = contact;
  
  const farmerUrl = `http://${address}:${port}/download/link/${shard.hash}`;
  const farmerRes = await axios.get(farmerUrl);
  const downloadUrl = farmerRes.data.result;

  return downloadUrl;
}

const getUploadUrl = (uuid: string) => {
  return S3Bucket.getSignedUrl('putObject', {
    Bucket: S3BucketName,
    Key: uuid,
    ContentType: 'application/octet-stream',
    Expires: 3600,
  });
}

const migrateShard = async (shard: any, index: number, bucketEntry: any): Promise<void> => {
  const uuid = uuidv4();
  
  const [downloadUrl, uploadUrl] = await Promise.all([
    getDownloadUrl(shard),
    getUploadUrl(uuid),
  ]);
  // Perform shard stream download/upload here.
    // TODO
  // End perform shard stream download/upload

  // Update data structures:
  shard.uuid = uuid;
  await shard.save();
  const bucketEntryShard = await BucketEntryShardModel.create({
    bucketEntry: bucketEntry.id,
    shard: shard.id,
    index
  });
}

const migrateBucketEntry = async (bucketEntry: any) => {
  if (!bucketEntry.frame) { 
    bucketEntry.delete = true;
    return bucketEntry.save();
  }

  const shards = bucketEntry.frame.shards;

  if (!shards) {
    bucketEntry.delete = true;
    return bucketEntry.save();
  }

  const promises = shards.map((shard:any, index:number) => migrateShard(shard, index, bucketEntry));
  await Promise.all(promises);

  bucketEntry.version = 2;
  await bucketEntry.save();
};

const migrateBucket = async (bucket:any): Promise<void> => {
  const bucketEntries = BucketEntryModel.find({
    $and: [
      { bucket: bucket._id },
      {
        $or: [
          { version: { $eq: 1 } },
          { version: { $exists: false } },
        ]
      }
    ]
  })
  .populate({
    path: 'frame',
    populate: { 
      path: 'shards'
    }
  })
  .sort({ _id: 1 })
  .cursor();
  
  await iterateOverCursor(bucketEntries, migrateBucketEntry);
}

async function migrateUser(userEmail: string): Promise<void> {
  console.log('Migrating user: ', userEmail);

  const bucketsCursor = BucketModel
    .find({ user: userEmail })
    .sort({ _id: 1 })
    .cursor();
  
  bucketsCursor.once('error', (err:any) => {
      console.log('fatal error', err)
    });

  
  await iterateOverCursor(bucketsCursor, migrateBucket)
}

function onProgramFinished(err: Error | void) {
  let programFinishedMessage = `Program finished. Migrated ${migratedBuckets} bucket(s).`;
  if (err) {
    programFinishedMessage += `Error ${err.message || 'Unknown error'}`;
    console.log(err.stack);
  }
  console.log(programFinishedMessage);
}

migrateUser(program.email)
  .then(onProgramFinished)
  .catch(onProgramFinished)
  .finally(() => {
    storage.connection.close();
    clearInterval(loggerInterval);
  });
