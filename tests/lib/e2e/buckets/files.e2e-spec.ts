import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import axios from 'axios';
import { engine, testServer } from '../setup';
import { type User } from '../users.fixtures';
import { createTestUser, getAuth, shutdownEngine } from '../utils';
import sinon from 'sinon';

const FAKE_UPLOAD_URL = 'http://fake-upload-url'
const FAKE_DOWNLOAD_URL = 'http://fake-download-url'

describe('Bridge E2E Tests', () => {

  let testUser: User
  let axiosGetStub: sinon.SinonStub
  beforeAll(async () => {
    testUser = await createTestUser()

    // Arrange: Create fake contact per each node
    const nodeIDs = Object.values(engine._config.application.CLUSTER)
    await Promise.all(
      nodeIDs.map((nodeID, index) => {
        const payload = { nodeID, protocol: "1.2.0-INXT", address: `72.132.43.${index}`, port: 43758 + index, lastSeen: new Date(), }
        return new Promise(resolve => engine.storage.models.Contact.record(payload, resolve))
      })
    )

  })

  afterAll(async () => {
    await shutdownEngine()
  })



  beforeEach(() => {

    axiosGetStub = sinon.stub(axios, 'get')
    jest.clearAllMocks()
    axiosGetStub.callsFake(async (url: string) => {
      if (url.includes('/v2/upload/link')) return { data: { result: FAKE_UPLOAD_URL } }
      if (url.includes('/v2/upload-multipart/link')) {
        const parts = new URL(url).searchParams.get('parts')
        return { data: { result: new Array(parts).fill(FAKE_UPLOAD_URL), UploadId: 'fake-id' } }
      }
      if (url.includes('/v2/download/link')) return { data: { result: FAKE_DOWNLOAD_URL } }
      if (url.includes('exists')) return { status: 200 }
    })
  })

  afterEach(() => {
    axiosGetStub.restore()
  })

  describe('File Management v2', () => {

    describe('Uploading a file', () => {

      it('When a user wants to upload a file with just one part, it should work for owned buckets and get an upload link', async () => {
        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))
          .expect(201)

        // Act: start the upload
        const response = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: [{ index: 0, size: 1000, }], })

        // Assert
        expect(response.status).toBe(200);
        const { uploads } = response.body;

        expect(uploads).toHaveLength(1);

        const [upload] = uploads;

        expect(upload.url).toBe(FAKE_UPLOAD_URL)
        expect(upload.urls).toBeNull();
        expect(upload.uuid).toBeDefined();

      })

      it('When a user wants to upload a file over 100MB with multiple parts into a owned bucket, it should work and get a list of upload links one per each file part', async () => {
        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))
          .expect(201)

        // Act: start the upload
        const MB100 = 100 * 1024 * 1024
        const fileParts = [{ index: 0, size: MB100 / 2, }, { index: 1, size: MB100 / 2, },]
        const response = await testServer.post(`/v2/buckets/${bucketId}/files/start?multiparts=${fileParts.length}`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: fileParts, })

        // Assert
        expect(response.status).toBe(200);
        const { uploads } = response.body;

        expect(uploads).toHaveLength(2);

        const [firstUpload, secondUpload] = uploads;

        expect(firstUpload.url).toBeNull();
        expect(firstUpload.urls).toBeDefined();
        expect(firstUpload.uuid).toBeDefined();
        expect(firstUpload.UploadId).toBeDefined();

        expect(secondUpload.url).toBeDefined();
        expect(secondUpload.url).toBeNull();
        expect(secondUpload.urls).toBeDefined();
        expect(secondUpload.uuid).toBeDefined();
        expect(secondUpload.UploadId).toBeDefined();

      })

      it('When a user wants to upload a file with multiple parts, it should fail if is under 100MB', async () => {
        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))
          .expect(201)

        // Act: start the upload
        const MB100 = 99 * 1024 * 1024
        const fileParts = [{ index: 0, size: MB100 / 2, }, { index: 1, size: MB100 / 2, },]
        const response = await testServer.post(`/v2/buckets/${bucketId}/files/start?multiparts=${fileParts.length}`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: fileParts, })

        // Assert
        expect(response.status).toBe(400)
        expect(response.body.error).toBe('Multipart is not allowed for files smaller than 100MB')

      })


      it('When a user finishes to upload a file, the user can finish the upload with a hash per each part uploaded', async () => {

        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))

        // Arrange: start the upload
        const response = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: [{ index: 0, size: 1000, }] })

        const { uploads: [upload] } = response.body;

        // Act: finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        const responseComplete = await testServer.post(`/v2/buckets/${bucketId}/files/finish`)
          .set('Authorization', getAuth(testUser))
          .send({
            index,
            shards: [{ hash: crypto.randomBytes(20).toString('hex'), uuid: upload.uuid, }],
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
            shards: (uploads as any[]).map(upload => ({ hash: crypto.randomBytes(20).toString('hex'), uuid: upload.uuid, })),
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

        const [firstShard, secondShard] = body.shards

        expect(firstShard.hash).toBeDefined()
        expect(firstShard.url).toBeDefined()
        expect(secondShard.hash).toBeDefined()
        expect(secondShard.url).toBeDefined()

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
            shards: (uploads as any[]).map(upload => ({ hash: crypto.randomBytes(20).toString('hex'), uuid: upload.uuid, })),
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
        const { body: { uploads: [upload] } } = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: [{ index: 0, size: 1000, }], })

        // Arrange: finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        const { body: file } = await testServer.post(`/v2/buckets/${bucketId}/files/finish`)
          .set('Authorization', getAuth(testUser))
          .send({
            index,
            shards: [{ hash: crypto.randomBytes(20).toString('hex'), uuid: upload.uuid, }],
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
        const { body: { uploads: [upload] } } = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: [{ index: 0, size: 1000, }], })

        // Arrange: finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        const { body: file } = await testServer.post(`/v2/buckets/${bucketId}/files/finish`)
          .set('Authorization', getAuth(testUser))
          .send({
            index,
            shards: [{ hash: crypto.randomBytes(20).toString('hex'), uuid: upload.uuid, }],
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

        const [shard] = fileInfo.shards
        expect(shard.index).toBeDefined()
        expect(shard.hash).toBeDefined()
        expect(shard.url).toBeDefined()

      })
    })
  })



});