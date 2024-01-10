import supertest from 'supertest';

declare var globalThis: any;

export const intervalRefs: NodeJS.Timer[] = [];

const realSetInterval = globalThis.setInterval;

globalThis.setInterval = jest.fn((...args: any[]) => {
  const ref = realSetInterval(...args);
  intervalRefs.push(ref);
  return ref;
})


if (process.env.inxtbridge_server__port !== '0') {
  console.warn('Warning: inxtbridge_server__port is not set to 0, this may cause conflicts with the test server');
}
// Remove jest options from process.argv
process.argv = process.argv.slice(0, 2);
export const engine = require('../../../bin/storj-bridge.ts');

if (!engine.storage.connection.options.dbName.includes('test')) {
  throw new Error("For caution test database must include test in it's name");
}

export const testServer = supertest(engine.server.app);

