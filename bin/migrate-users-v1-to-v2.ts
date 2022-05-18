import program from 'commander';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { config as loadEnv } from 'dotenv';
import axios from 'axios';
import Config from '../lib/config';
import { iterateOverCursor, iterateOverCursorWithWindowOf } from './cleaner/database';
import { Stream } from 'stream';
import { IncomingMessage } from 'http';

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
  .option('-u, --mongourl <mongo connection string>','mongo url connection string')
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

// TODO: To be decided if by program or ENV variables:
const S3BucketName = process.env.S3BucketName as string;
const S3Endpoint = process.env.S3Endpoint as string;
const S3AccessKeyId = process.env.S3AccessKeyId as string;
const S3SecretAccessKey = process.env.S3SecretAccessKey as string;
const S3Region = process.env.S3Region as string;

if (
  !S3BucketName ||
  !S3Endpoint ||
  !S3AccessKeyId ||
  !S3SecretAccessKey ||
  !S3Region
) {
  throw new Error('Missing S3 credentials');
}

const S3Bucket = new AWS.S3({
  endpoint: new AWS.Endpoint(S3Endpoint),
  credentials: new AWS.Credentials({
    accessKeyId: S3AccessKeyId,
    secretAccessKey: S3SecretAccessKey,
  }),
  signatureVersion: 'v4',
  region: S3Region,
  apiVersion: '2006-03-01',
});

let idBucketBeingChecked: string;
let migratedBuckets = 0;
let checkedBuckets = 0;

const config = new Config(process.env.NODE_ENV, program.config, '') as {
  storage: { mongoUrl: string; mongoOpts: any };
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
  Mirror: MirrorModel,
  Shard: ShardModel,
} = storage.models;

const logStatus = () => {
  console.log('Deleted buckets: ', migratedBuckets);
  console.log('Checked buckets: ', checkedBuckets);
  if (idBucketBeingChecked) {
    console.log('Id of last bucket checked: ', idBucketBeingChecked);
  }
};

const loggerInterval = setInterval(logStatus, 4000);

const performDownloadUpload = async (uuid: string, downloadUrl: string) => {
  const { data: shardReadable } = await axios.get<IncomingMessage>(
    downloadUrl,
    {
      responseType: 'stream',
    }
  );

  const shardWriteable = new Stream.PassThrough();

  const promise = S3Bucket.upload({
    Bucket: S3BucketName,
    Key: uuid,
    Body: shardWriteable,
  }).promise();

  shardReadable.pipe(shardWriteable);
  return promise;
};

const getDownloadUrl = async (shard: any) => {
  const { hash } = shard;
  const mirror = await MirrorModel.findOne({ shardHash: hash }).populate(
    'contact'
  );

  const { contact } = mirror;
  const { address, port } = contact;

  const farmerUrl = `http://${address}:${port}/download/link/${hash}`;
  const farmerRes = await axios.get(farmerUrl);
  const downloadUrl = farmerRes.data.result;

  return downloadUrl;
};

const migrateShard = async (
  shard: any,
  index: number,
  bucketEntry: any
): Promise<void> => {
  const uuid = uuidv4();

  const downloadUrl = await getDownloadUrl(shard);

  await performDownloadUpload(uuid, downloadUrl);

  // Update data structures:
  shard.uuid = uuid;
  await shard.save();
  const bucketEntryShard = await BucketEntryShardModel.create({
    bucketEntry: bucketEntry.id,
    shard: shard.id,
    index,
  });
};

const migrateBucketEntry = async (bucketEntry: any) => {
  if (!bucketEntry.frame) {
    bucketEntry.delete = true;
    return bucketEntry.save();
  }

  const pointers = bucketEntry.frame.shards;

  if (!pointers) {
    bucketEntry.delete = true;
    return bucketEntry.save();
  }

  const shardsHashes = pointers.map((p:any) => p.hash as string);

  const shards = await ShardModel.find({ hash: { $in: shardsHashes } });

  if(shards.length === 0){
    bucketEntry.delete = true;
    return bucketEntry.save();
  }

  const promises = shards.map(async (shard: any, index: number) => {
    const shardsInXNODES = await MirrorModel.find({ 
      shardHash: shard.hash,
      contact: { $in: XNODES } 
    });
    if(shardsInXNODES.length > 0){
      return migrateShard(shard, index, bucketEntry)
    }
  });
  await Promise.all(promises);

  bucketEntry.version = 2;
  await bucketEntry.save();
};

const migrateBucket = async (bucket: any): Promise<void> => {
  const bucketEntries = BucketEntryModel.find({
    $and: [
      { bucket: bucket._id },
      {
        $or: [{ version: { $eq: 1 } }, { version: { $exists: false } }],
      },
    ],
  })
    .populate({
      path: 'frame',
      populate: {
        path: 'shards',
      },
    })
    .sort({ _id: 1 })
    .cursor();

  const windowSize = 5;
  await iterateOverCursorWithWindowOf(bucketEntries, migrateBucketEntry, windowSize);
};

async function migrateUser(userEmail: string): Promise<void> {
  console.log('Migrating user: ', userEmail);
  const bucketsCursor = BucketModel.find({ user: userEmail })
    .sort({ _id: 1 })
    .cursor();

  await iterateOverCursor(bucketsCursor, migrateBucket);
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
