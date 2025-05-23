import supertest from 'supertest';

// Bitcore has a guard to throw if multiple instances exist. This is a workaround to avoid that.
Object.defineProperty(global,  '_bitcore', { 	get(){ 		return undefined 	}, 	set(){} })

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


const server = engine.server.app.listen(0);
export const testServerURL = server.address(); // We need to get the address of the server to use it in some tests
export const testServer = supertest(server);

