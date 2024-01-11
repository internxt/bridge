import { type MongoClient } from 'mongodb'
declare var globalThis: any

export default async () => {

  const client = globalThis.mongoClient as MongoClient;
  const dbName = globalThis.dbName as string;
  const db = client.db(dbName);

  const collections = await db.collections();
  await Promise.all(collections.map(collection => collection.deleteMany({})));
  await client.close();

  process.emit('SIGINT')
}
