import request from 'supertest';
import crypto from 'crypto';

const BRIDGE_URL = 'http://localhost:6382';

const email = 'test1@yahoo.com';
const password = 'Acvx2.df28dfsZs]';
const hex = crypto.createHash('sha256').update(password).digest('hex');
export const AuthorizationHeader = {
  Authorization: `Basic ${Buffer.from(`${email}:${hex}`).toString('base64')}`,
};
export const api = request(BRIDGE_URL);

const TRIES_UNTIL_BRIDGE_IS_READY = 10;
const INTERVAL_FOR_RETRY = 3000;

export const waitForBridgeToBeUp = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const interval = setInterval(async () => {
      try {
        console.log('Checking if bridge is up...');
        await api.get('/');
        console.log('Bridge is up!');
        clearInterval(interval);
        resolve();
      } catch (err) {
        tries += 1;

        if (tries > TRIES_UNTIL_BRIDGE_IS_READY) {
          clearInterval(interval);
          reject(new Error('Too many tries to connect to Bridge'));
        } else {
          console.log(
            `Bridge Api not ready yet, waiting: ${
              INTERVAL_FOR_RETRY / 1000
            } more seconds`
          );
        }
      }
    }, INTERVAL_FOR_RETRY);
  });
};

export async function registerSampleUserAndGetBucketId() {
  const signupResponse = await api.post('/users').send({
    email,
    password: hex,
  });

  if (signupResponse.body?.error === 'Email is already registered') {
    const existingBuckets = await api.get('/buckets').set(AuthorizationHeader);
    if (existingBuckets.body.length === 0) {
      throw new Error('No buckets found');
    }
    const bucketId = existingBuckets.body[0].id;
    return bucketId;
  }

  const createBucketResponse = await api
    .post('/buckets')
    .set(AuthorizationHeader);
  const bucketId = createBucketResponse.body.id;

  return bucketId;
}
