import { randomBytes } from 'crypto';
import { ObjectId } from 'mongodb';
import { v4 } from 'uuid';
import { engine, testServer } from '../setup';
import { dataGenerator } from '../users.fixtures';
import KeyPair, { shutdownEngine } from '../utils';

describe('Signed requests e2e tests', () => {
  const bucketId = new ObjectId();
  const keyPair = new KeyPair(randomBytes(32).toString('hex'));
  // Public keys and nonces only accept users whose id is an email, so only legacy users can sign requests.
  const legacyUser = { _id: dataGenerator.email(), uuid: v4() };

  const sign = (method: string, path: string, query: string) =>
    keyPair.sign(Buffer.from([method, path, query].join('\n'), 'utf8'), { compact: false });

  const getBuckets = (query: string, signature = sign('GET', '/buckets', query)) =>
    testServer
      .get(`/buckets?${query}`)
      .set('x-pubkey', keyPair.getPublicKey())
      .set('x-signature', signature);

  beforeAll(async () => {
    const { Bucket, PublicKey, User } = engine.storage.models;

    await User.collection.insertOne({
      ...legacyUser,
      email: legacyUser._id,
      hashpass: randomBytes(32).toString('hex'),
      maxSpaceBytes: 1024,
      activated: true,
    });

    await new Promise((resolve, reject) => {
      PublicKey.create(legacyUser, keyPair.getPublicKey(), (err: Error, publicKey: unknown) =>
        err ? reject(err) : resolve(publicKey),
      );
    });

    await Bucket.collection.insertOne({
      _id: bucketId,
      userId: legacyUser.uuid,
      user: legacyUser._id,
      status: 'Active',
      name: 'signed-requests',
      pubkeys: [],
    });
  });

  afterAll(async () => {
    const { Bucket, PublicKey, User, UserNonce } = engine.storage.models;

    await Promise.all([
      Bucket.collection.deleteOne({ _id: bucketId }),
      PublicKey.collection.deleteOne({ _id: keyPair.getPublicKey() }),
      User.collection.deleteOne({ _id: legacyUser._id }),
      UserNonce.collection.deleteMany({ user: legacyUser._id }),
    ]);

    await shutdownEngine();
  });

  describe('Authenticating a GET request with a query', () => {
    it('When the signature covers the query and the nonce is new, then it should authenticate the user', async () => {
      const response = await getBuckets(`__nonce=${v4()}`);

      expect(response.status).toBe(200);
      expect(response.body.map((bucket: any) => bucket.id)).toContain(bucketId.toString());
    });

    it('When the signature does not cover the query, then it should reject the request', async () => {
      const signature = sign('GET', '/buckets', `__nonce=${v4()}`);

      const response = await getBuckets(`__nonce=${v4()}`, signature);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid signature');
    });
  });
});
