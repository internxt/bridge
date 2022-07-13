/* eslint-disable no-console */
import { Db, MongoClient } from "mongodb";
import { unloadLoadFixtures } from "./fixtures/init-fixtures";
import { config } from "dotenv";
import { setupAndValidateStorageForFixtures } from "./repositories/utils";
config();

const initCollectionsIfNotExist = [
  "buckets",
  "bucketentries",
  "bucketentryshards",
  "users",
  "frames",
  "shards",
  "tokens",
  "mirrors",
  "uploads",
  "contacts",
  "pointers",
];

async function init() {
  const { uri, BRIDGE_TEST_DB_NAME } = setupAndValidateStorageForFixtures();

  const mongoClient = new MongoClient(uri);

  try {
    await mongoClient.connect();

    const adminDb = new Db(mongoClient, "admin").admin();
    const db = mongoClient.db(BRIDGE_TEST_DB_NAME);
    const availableDatabases = await adminDb.listDatabases();
    const bridgeDBTestExists = availableDatabases.databases.find(
      (d) => d.name === BRIDGE_TEST_DB_NAME
    );

    if (!bridgeDBTestExists) {
      console.log("Bridge Test database does not exist. Initializing");
      await db.collection("test-one").insertOne({});
      console.log("Bridge Test Database initialized succesfully");
    }

    const collections = await db.listCollections().toArray();

    for (const collection of initCollectionsIfNotExist) {
      if (!collections.find((c) => c.name === collection)) {
        await db.createCollection(collection);
      }
    }

    await unloadLoadFixtures(uri, BRIDGE_TEST_DB_NAME);

    await mongoClient.close();
  } catch (err) {
    await mongoClient.close();

    throw err;
  }
}

let exitCode = 0;

init()
  .then(() => {
    console.log("* Test Database initialized");
  })
  .catch((err) => {
    exitCode = 1;
    console.error("Error initializing test database: %s", err.message);
    console.log(err);
  })
  .finally(() => {
    process.exit(exitCode);
  });
