import axios from 'axios';
import { randomBytes } from 'crypto';
import { ObjectId } from 'mongodb';
import sinon from 'sinon';
import { engine, testServer } from '../setup';
import { type User } from '../users.fixtures';
import { cleanUpTestUsers, createTestUser, getAuth, shutdownEngine } from '../utils';

const VALID_CONTRACT = {
  audit_count: 3,
  data_hash: 'c'.repeat(40),
  data_size: 1024,
  farmer_id: 'b'.repeat(40),
  payment_destination: '',
  payment_download_price: 0,
  payment_storage_price: 0,
  renter_hd_index: false,
  renter_hd_key: false,
  renter_id: 'a'.repeat(40),
  store_begin: 1000,
  store_end: 2000000000000,
  version: 0,
};

const randomHash = () => randomBytes(20).toString('hex');

type ShardSeed = {
  hash?: string;
  farmers?: string[];
  contract?: Record<string, unknown>;
  withoutShard?: boolean;
};

describe('V1 file download e2e tests', () => {
  const bucketId = new ObjectId();
  const seeded = {
    contacts: [] as string[],
    pointers: [] as ObjectId[],
    frames: [] as ObjectId[],
    entries: [] as ObjectId[],
    hashes: [] as string[],
  };

  let testUser: User;
  let axiosGetStub: sinon.SinonStub;
  let preferredFarmer: any;
  let fallbackFarmer: any;
  let timedOutFarmer: any;
  let farmerWithoutPort: any;

  const createFarmer = async (fields: Record<string, unknown>) => {
    const farmer = { _id: randomHash(), address: '72.132.43.10', port: 43758, ...fields };

    await engine.storage.models.Contact.collection.insertOne(farmer);
    seeded.contacts.push(farmer._id);

    return farmer;
  };

  const createFile = async (shards: ShardSeed[]) => {
    const { Pointer, Frame, BucketEntry, Shard } = engine.storage.models;
    const pointerIds: ObjectId[] = [];
    const hashes: string[] = [];

    for (let index = 0; index < shards.length; index++) {
      const { hash = randomHash(), farmers = [], contract = VALID_CONTRACT, withoutShard } = shards[index];
      const pointerId = new ObjectId();

      await Pointer.collection.insertOne({
        _id: pointerId,
        index,
        hash,
        size: 1024,
        parity: false,
        challenges: [],
        tree: [],
      });

      if (!withoutShard) {
        await Shard.collection.insertOne({
          hash,
          contracts: farmers.map((nodeID: string) => ({ nodeID, contract })),
          trees: [],
          challenges: [],
          meta: [],
        });
      }

      pointerIds.push(pointerId);
      hashes.push(hash);
    }

    const frameId = new ObjectId();
    const entryId = new ObjectId();

    await Frame.collection.insertOne({ _id: frameId, user: testUser.email, shards: pointerIds, size: 1024, locked: true });
    await BucketEntry.collection.insertOne({ _id: entryId, frame: frameId, bucket: bucketId, name: 'file', index: 'e'.repeat(64) });

    seeded.pointers.push(...pointerIds);
    seeded.frames.push(frameId);
    seeded.entries.push(entryId);
    seeded.hashes.push(...hashes);

    return { id: entryId.toString(), hashes };
  };

  const getFile = (fileId: string, query = '') =>
    testServer
      .get(`/buckets/${bucketId}/files/${fileId}${query}`)
      .set('Authorization', getAuth(testUser));

  beforeAll(async () => {
    testUser = await createTestUser();

    await engine.storage.models.Bucket.collection.insertOne({
      _id: bucketId,
      userId: testUser.uuid,
      user: testUser.email,
      status: 'Active',
      name: 'v1-downloads',
      pubkeys: [],
    });

    preferredFarmer = await createFarmer({ lastSeen: new Date(5000), protocol: '1.2.0-INXT', userAgent: 'farmer-agent' });
    fallbackFarmer = await createFarmer({ lastSeen: new Date(3000) });
    timedOutFarmer = await createFarmer({ lastSeen: new Date(1000), lastTimeout: new Date() });
    farmerWithoutPort = await createFarmer({ lastSeen: new Date(2000), port: undefined });
  });

  beforeEach(() => {
    axiosGetStub = sinon.stub(axios, 'get').callsFake(async (url: string) => ({
      data: { result: `http://download${new URL(url).pathname}` },
    }));
  });

  afterEach(() => {
    axiosGetStub.restore();
  });

  afterAll(async () => {
    const { Bucket, BucketEntry, Contact, Frame, Pointer, Shard } = engine.storage.models;

    await Promise.all([
      Bucket.collection.deleteOne({ _id: bucketId }),
      BucketEntry.collection.deleteMany({ _id: { $in: seeded.entries } }),
      Contact.collection.deleteMany({ _id: { $in: seeded.contacts } }),
      Frame.collection.deleteMany({ _id: { $in: seeded.frames } }),
      Pointer.collection.deleteMany({ _id: { $in: seeded.pointers } }),
      Shard.collection.deleteMany({ hash: { $in: seeded.hashes } }),
    ]);

    await cleanUpTestUsers();
    await shutdownEngine();
  });

  describe('Getting the mirrors of a file', () => {
    it('When the shards have available farmers, then it should return each shard with its farmer and download url', async () => {
      const file = await createFile([
        { farmers: [fallbackFarmer._id, preferredFarmer._id] },
        { farmers: [preferredFarmer._id] },
      ]);

      const response = await getFile(file.id);

      const expectedFarmer = {
        userAgent: 'farmer-agent',
        protocol: '1.2.0-INXT',
        address: preferredFarmer.address,
        port: preferredFarmer.port,
        nodeID: preferredFarmer._id,
        lastSeen: preferredFarmer.lastSeen.toISOString(),
      };

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual(
        file.hashes.map((hash, index) => ({
          index,
          hash,
          size: 1024,
          parity: false,
          token: expect.stringMatching(/^[0-9a-f]{32}$/),
          farmer: expectedFarmer,
          operation: 'PULL',
          url: `http://download/download/link/${hash}`,
        })),
      );
    });

    it('When the farmers are contacted, then each one should receive the token returned to the client', async () => {
      const file = await createFile([{ farmers: [preferredFarmer._id] }]);

      const response = await getFile(file.id);

      const { address, port } = preferredFarmer;

      expect(axiosGetStub.calledOnce).toBe(true);
      expect(axiosGetStub.firstCall.args).toStrictEqual([
        `http://${address}:${port}/download/link/${file.hashes[0]}`,
        { headers: { 'X-TOKEN': response.body[0].token } },
      ]);
    });

    it('When using skip and limit, then it should only return the requested shards', async () => {
      const file = await createFile([
        { farmers: [preferredFarmer._id] },
        { farmers: [preferredFarmer._id] },
        { farmers: [preferredFarmer._id] },
      ]);

      const response = await getFile(file.id, '?skip=1&limit=1');

      expect(response.status).toBe(200);
      expect(response.body.map((shard: any) => shard.hash)).toStrictEqual([file.hashes[1]]);
    });

    it('When excluding a farmer, then it should choose the next one available', async () => {
      const file = await createFile([{ farmers: [preferredFarmer._id, fallbackFarmer._id] }]);

      const response = await getFile(file.id, `?exclude=${preferredFarmer._id}`);

      expect(response.status).toBe(200);
      expect(response.body[0].farmer.nodeID).toBe(fallbackFarmer._id);
    });

    it('When excluding every farmer, then it should return the shard without a farmer', async () => {
      const file = await createFile([{ farmers: [preferredFarmer._id, fallbackFarmer._id] }]);

      const response = await getFile(file.id, `?exclude=${preferredFarmer._id},${fallbackFarmer._id}`);

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual([
        { index: 0, hash: file.hashes[0], size: 1024, parity: false },
      ]);
    });

    it('When the exclude parameter is repeated, then it should fail', async () => {
      const file = await createFile([{ farmers: [preferredFarmer._id] }]);

      const response = await getFile(file.id, `?exclude=${preferredFarmer._id}&exclude=${fallbackFarmer._id}`);

      expect(response.status).toBe(500);
    });

    it('When the exclude parameter uses brackets, then it should be ignored', async () => {
      const file = await createFile([{ farmers: [preferredFarmer._id] }]);

      const response = await getFile(file.id, '?exclude[$ne]=1');

      expect(response.status).toBe(200);
      expect(response.body[0].farmer.nodeID).toBe(preferredFarmer._id);
    });

    it('When the only farmer has recently timed out, then it should return the shard without a farmer', async () => {
      const file = await createFile([{ farmers: [timedOutFarmer._id] }]);

      const response = await getFile(file.id);

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual([
        { index: 0, hash: file.hashes[0], size: 1024, parity: false },
      ]);
    });

    it('When a shard does not exist, then it should fail', async () => {
      const file = await createFile([{ withoutShard: true }]);

      const response = await getFile(file.id);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Shard data not found');
    });

    it('When a shard has no contracts, then it should return the shard without a farmer', async () => {
      const file = await createFile([{ farmers: [] }]);

      const response = await getFile(file.id);

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual([
        { index: 0, hash: file.hashes[0], size: 1024, parity: false },
      ]);
    });

    it('When the farmer of a contract is unknown, then it should return the shard without a farmer', async () => {
      const file = await createFile([{ farmers: [randomHash()] }]);

      const response = await getFile(file.id);

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual([
        { index: 0, hash: file.hashes[0], size: 1024, parity: false },
      ]);
    });

    it('When the farmer has no user agent or protocol, then it should use the default values', async () => {
      const file = await createFile([{ farmers: [fallbackFarmer._id] }]);

      const response = await getFile(file.id);

      expect(response.status).toBe(200);
      expect(response.body[0].farmer).toStrictEqual({
        userAgent: '8.7.2',
        protocol: '1.2.0',
        address: fallbackFarmer.address,
        port: fallbackFarmer.port,
        nodeID: fallbackFarmer._id,
        lastSeen: fallbackFarmer.lastSeen.toISOString(),
      });
    });

    it('When a contract is invalid, then it should fail', async () => {
      const file = await createFile([{ farmers: [preferredFarmer._id], contract: { store_end: 'invalid' } }]);

      const response = await getFile(file.id);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Invalid contract specification was supplied');
    });

    it('When the farmer has no port, then it should fail', async () => {
      const file = await createFile([{ farmers: [farmerWithoutPort._id] }]);

      const response = await getFile(file.id);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Invalid port was supplied');
    });
  });
});
