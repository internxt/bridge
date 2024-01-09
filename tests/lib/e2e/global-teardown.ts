import { type MongoClient } from 'mongodb'
declare var globalThis: any

export default async () => {

  const client = globalThis.mongoClient as MongoClient;
  const db = client.db();

  await Promise.all([
    db.collection('users').deleteMany({}),
    db.collection('buckets').deleteMany({})
  ]);

  await client.close();

  process.emit('SIGINT')
}
