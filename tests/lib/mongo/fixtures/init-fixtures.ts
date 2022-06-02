import Fixtures from 'node-mongodb-fixtures';

export async function unloadLoadFixtures(uri: string, dbName: string) {
  try {
    const fixtures = new Fixtures({
      dir: './tests/lib/mongo/fixtures/exports',
    });

    await fixtures.connect(uri, {}, dbName);
    await fixtures.unload();
    await fixtures.load();
    await fixtures.disconnect();
  } catch (err: any) {
    console.log('Error loading fixtures: ', err.message);
    console.log(err.stack);
    throw err;
  }
}
