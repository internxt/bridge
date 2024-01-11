import { config as loadEnv } from 'dotenv'
import { MongoClient } from 'mongodb';
declare var globalThis: any

export default async () => {
  const collections = [
    'bucketentries',
    'buckets',
    'contacts',
    'exchangereports',
    'frames',
    'fullaudits',
    'marketings',
    'mirrors',
    'partners',
    'pointers',
    'publickeys',
    'referrals',
    'shards',
    'storageevents',
    'tokens',
    'usernonces',
    'users',
  ]

  loadEnv();
  const url = process.env.inxtbridge_storage__mongoUrl;
  const user = process.env.inxtbridge_storage__mongoOpts__user;
  const password = process.env.inxtbridge_storage__mongoOpts__pass;
  if (!url) throw new Error('Missing mongo url');
  if (!user) throw new Error('Missing mongo user');
  if (!password) throw new Error('Missing mongo password');

  if (!url.includes('test')) {
    throw new Error("For caution test database must include test in it's name");
  }

  const urlParts = url.split('/');
  const dbName = urlParts.pop();
  const client = new MongoClient(urlParts.join('/'));

  await client.connect();

  const db = client.db(dbName);

  await db.addUser(user, password, { roles: ['dbOwner'] }).catch(error => console.log(error.message));

  await Promise.all(collections.map(collection => db.collection(collection).deleteMany({})));

  globalThis.mongoClient = client;
  globalThis.dbName = dbName;
}