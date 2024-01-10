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
  const collections = await db.collections();
  await Promise.all(collections.map(collection => collection.deleteMany({})));

  globalThis.mongoClient = client;
}