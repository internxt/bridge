import Config from "../../../../lib/config";
const Storage = require("storj-service-storage-models") as any;

export function setupAndValidateStorageForFixtures() {
  if (!process.env.DATABASE_URI) {
    throw new Error("Missing DATABASE_URI env variable");
  }

  const BRIDGE_TEST_DB_NAME = process.env.DATABASE_URI.split("/").pop();

  if (!BRIDGE_TEST_DB_NAME) {
    throw new Error("Missing database name");
  }

  if (!BRIDGE_TEST_DB_NAME.includes("test")) {
    throw new Error("For caution test database must include test in it's name");
  }

  const uri = process.env.DATABASE_URI.replace(`/${BRIDGE_TEST_DB_NAME}`, "");

  const internalConfig = new Config(process.env.NODE_ENV, "", "") as {
    storage: { mongoUrl: string; mongoOpts: any };
  };

  const storage = new Storage(
    process.env.DATABASE_URI,
    internalConfig.storage.mongoOpts
  );

  return {
    storage,
    uri,
    BRIDGE_TEST_DB_NAME,
    internalConfig,
  };
}
