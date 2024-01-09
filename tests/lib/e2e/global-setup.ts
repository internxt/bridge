import { config as loadEnv } from 'dotenv'
import { MongoClient } from 'mongodb';
declare var globalThis: any

export default async () => {
  loadEnv();
  const url = process.env.inxtbridge_storage__mongoUrl;
  if (!url) throw new Error('Missing mongo url');
  if (!url.includes('test')) {
    throw new Error("For caution test database must include test in it's name");
  }
  const client = new MongoClient(url);
  await client.connect();

  const db = client.db();
  await Promise.all([
    db.collection('users').deleteMany({}),
    db.collection('buckets').deleteMany({})
  ]);

  globalThis.mongoClient = client;
}