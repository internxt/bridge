import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import axios from 'axios';
import { engine, testServer } from '../setup';
import { type User } from '../users.fixtures';
import { createTestUser, getAuth, shutdownEngine } from '../utils';
import sinon from 'sinon';


describe('Bridge E2E Tests', () => {

  let testUser: User
  let axiosGetStub: sinon.SinonStub
  beforeAll(async () => {
    testUser = await createTestUser()

    // Create fake contact per each node
    const nodeIDs = Object.values(engine._config.application.CLUSTER)
    await Promise.all(
      nodeIDs.map((nodeID, index) => {
        const payload = { nodeID, protocol: "1.2.0-INXT", address: `72.132.43.${index}`, port: 43758 + index, lastSeen: new Date(), }
        return new Promise(resolve => engine.storage.models.Contact.record(payload, resolve))
      })
    )

  })

  afterAll(async () => {
    await shutdownEngine(engine)
  })



  beforeEach(() => {

    axiosGetStub = sinon.stub(axios, 'get')
    jest.clearAllMocks()
    axiosGetStub.callsFake(async (url: string) => {
      if (url.includes('/v2/upload/link')) return { data: { result: 'http://fake-url' } }
      if (url.includes('/v2/download/link')) return { data: { result: 'http://fake-url' } }
      if (url.includes('exists')) return { status: 200 }
    })
  })

  afterEach(() => {
    axiosGetStub.restore()
  })

  describe('File Management v2', () => {

    describe('Uploading a file', () => {

      it('When a user wants to upload a file, it should work for owned buckets and get a list of upload links one per each file part', async () => {
        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))
          .expect(201)

        // Act: start the upload
        const response = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: [{ index: 0, size: 1000, }, { index: 1, size: 10000, },], })

        // Assert
        expect(response.status).toBe(200);
        const { uploads } = response.body;

        expect(uploads).toHaveLength(2);

        const upload1 = uploads[0];
        expect(upload1.url).toBe('http://fake-url')
        expect(upload1.urls).toBeNull();
        expect(upload1.uuid).toBeDefined();

        const upload2 = uploads[1];
        expect(upload2.url).toBeDefined();
        expect(upload2.url).toBe('http://fake-url')
        expect(upload2.urls).toBeNull();
        expect(upload2.uuid).toBeDefined();

      })


      it('When a user finishes to upload a file, the user can finish the upload with a hash per each part uploaded', async () => {

        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))

        // Arrange: start the upload
        const response = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: [{ index: 0, size: 1000, }, { index: 1, size: 10000, },], })

        const { uploads } = response.body;

        // Act: finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        const responseComplete = await testServer.post(`/v2/buckets/${bucketId}/files/finish`)
          .set('Authorization', getAuth(testUser))
          .send({
            index,
            shards: [
              { hash: crypto.randomBytes(20).toString('hex'), uuid: uploads[0].uuid, },
              { hash: crypto.randomBytes(20).toString('hex'), uuid: uploads[1].uuid, },
            ],
          });

        // Assert
        expect(responseComplete.status).toBe(200);

        const body = responseComplete.body;

        expect(body.bucket).toEqual(bucketId);
        expect(body.created).toBeDefined();
        expect(body.filename).toBeDefined();
        expect(body.id).toBeDefined();
        expect(body.index).toEqual(index);
        expect(body.mimetype).toBeDefined();
        expect(body.renewal).toBeDefined();
        expect(body.size).toBeGreaterThan(0);
        expect(typeof body.size).toBe('number');
        expect(body.version).toBe(2);
      });

    })

    describe('Downloading a file', () => {

      it('When a user wants to download a file, it should get a list of links for each file part', async () => {
        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))

        // Arrange: start the upload
        const { body: { uploads } } = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: [{ index: 0, size: 1000, }, { index: 1, size: 10000, },], })

        // Arrange: finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        const { body: file } = await testServer.post(`/v2/buckets/${bucketId}/files/finish`)
          .set('Authorization', getAuth(testUser))
          .send({
            index,
            shards: [
              { hash: crypto.randomBytes(20).toString('hex'), uuid: uploads[0].uuid, },
              { hash: crypto.randomBytes(20).toString('hex'), uuid: uploads[1].uuid, },
            ],
          });


        // Act: download the file
        const response = await testServer.get(`/v2/buckets/${bucketId}/files/${file.id}/mirrors`)
          .set('Authorization', getAuth(testUser))

        // Assert
        expect(response.status).toBe(200);
        const body = response.body;
        expect(body.bucket).toBe(bucketId)
        expect(body.created).toBeDefined()
        expect(body.index).toBe(index)
        expect(body.shards).toHaveLength(2)
        expect(body.shards[0].hash).toBeDefined()
        expect(body.shards[0].url).toBeDefined()
        expect(body.shards[1].hash).toBeDefined()
        expect(body.shards[1].url).toBeDefined()

      })

    })

  })

  describe('File Management v1', () => {
    describe('Deleting a file', () => {

      it('When a user wants to delete a file, it should work if the file and the bucket exist', async () => {
        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))

        // Arrange: start the upload
        const { body: { uploads } } = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: [{ index: 0, size: 1000, }, { index: 1, size: 10000, },], })

        // Arrange: finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        const { body: file } = await testServer.post(`/v2/buckets/${bucketId}/files/finish`)
          .set('Authorization', getAuth(testUser))
          .send({
            index,
            shards: [
              { hash: crypto.randomBytes(20).toString('hex'), uuid: uploads[0].uuid, },
              { hash: crypto.randomBytes(20).toString('hex'), uuid: uploads[1].uuid, },
            ],
          });


        // Act: remove the file
        const response = await testServer.delete(`/buckets/${bucketId}/files/${file.id}`)
          .set('Authorization', getAuth(testUser))

        // Assert
        expect(response.status).toBe(204);

      })

      it('When a user wants to delete a file, it should work if the file does not exist', async () => {
        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))

        // Act: remove the file
        const fakeFileId = new ObjectId()
        const response = await testServer.delete(`/buckets/${bucketId}/files/${fakeFileId}`)
          .set('Authorization', getAuth(testUser))

        // Assert
        expect(response.status).toBe(404);

      })
    })

    describe('Sharing a file', () => {
      it('When a user wants to share a file, it should be able to create a token for the bucket passing PULL as operation', async () => {

        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))

        // Act
        const response = await testServer.post(`/buckets/${bucketId}/tokens`)
          .set('Authorization', getAuth(testUser))
          .send({ operation: 'PULL', })

        // Assert
        expect(response.status).toBe(201);

        const { body } = response

        expect(body.bucket).toBeDefined()
        expect(body.operation).toBeDefined()
        expect(body.expires).toBeDefined()
        expect(body.token).toBeDefined()
        expect(body.encryptionKey).toBeDefined()
        expect(body.id).toBeDefined()
      })
      it('When a user wants to share a file, it should be able to create a token for the bucket passing PULL as operation and an existing file', async () => {

        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))

        // Arrange: start the upload
        const { body: { uploads } } = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: [{ index: 0, size: 1000, }], })

        // Arrange: finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        const { body: file } = await testServer.post(`/v2/buckets/${bucketId}/files/finish`)
          .set('Authorization', getAuth(testUser))
          .send({
            index,
            shards: [{ hash: crypto.randomBytes(20).toString('hex'), uuid: uploads[0].uuid, }],
          });

        // Act
        const response = await testServer.post(`/buckets/${bucketId}/tokens`)
          .set('Authorization', getAuth(testUser))
          .send({ operation: 'PULL', file: file.id })

        // Assert 
        expect(response.status).toBe(201);

        const { body } = response

        expect(body.bucket).toBeDefined()
        expect(body.operation).toBeDefined()
        expect(body.expires).toBeDefined()
        expect(body.token).toBeDefined()
        expect(body.id).toBeDefined()
        expect(body.encryptionKey).toBeDefined()
        expect(body.mimetype).toBeDefined()
        expect(body.size).toBeDefined()
      })

      it('When a user wants to share a file, it should be able to get the file info', async () => {

        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))

        // Arrange: start the upload
        const { body: { uploads } } = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: [{ index: 0, size: 1000, }], })

        // Arrange: finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        const { body: file } = await testServer.post(`/v2/buckets/${bucketId}/files/finish`)
          .set('Authorization', getAuth(testUser))
          .send({
            index,
            shards: [{ hash: crypto.randomBytes(20).toString('hex'), uuid: uploads[0].uuid, }],
          });

        // Act
        const response = await testServer.get(`/buckets/${bucketId}/files/${file.id}/info`)
          .set('Authorization', getAuth(testUser))

        // Assert 
        expect(response.status).toBe(200);

        const { body: fileInfo } = response
        expect(fileInfo.bucket).toBeDefined()
        expect(fileInfo.index).toBeDefined()
        expect(fileInfo.size).toBeDefined()
        expect(fileInfo.version).toBeDefined()
        expect(fileInfo.created).toBeDefined()
        expect(fileInfo.renewal).toBeDefined()
        expect(fileInfo.mimetype).toBeDefined()
        expect(fileInfo.filename).toBeDefined()
        expect(fileInfo.id).toBeDefined()
        expect(fileInfo.shards).toBeDefined()
        expect(fileInfo.shards).toHaveLength(1)
        expect(fileInfo.shards[0].index).toBeDefined()
        expect(fileInfo.shards[0].hash).toBeDefined()
        expect(fileInfo.shards[0].url).toBeDefined()

      })
    })
  })



});