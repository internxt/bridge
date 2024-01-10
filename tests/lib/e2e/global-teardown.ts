import { type MongoClient } from 'mongodb'
declare var globalThis: any

export default async () => {

  const client = globalThis.mongoClient as MongoClient;
  const db = client.db();

  const collections = await db.collections();
  await Promise.all(collections.map(collection => collection.deleteMany({})));
  await client.close();

  process.emit('SIGINT')
}
