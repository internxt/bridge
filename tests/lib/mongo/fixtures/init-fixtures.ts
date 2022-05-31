import Fixtures from "node-mongodb-fixtures";

export async function unloadLoadFixtures(uri: string, dbName: string) {
  const fixtures = new Fixtures({
    dir: "./tests/lib/mongo/fixtures/exports",
  });

  await fixtures.connect(uri, {}, dbName);
  await fixtures.unload();
  await fixtures.load();
  await fixtures.disconnect();
}
