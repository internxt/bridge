import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import axios from 'axios';
import { engine, testServer } from '../setup';
import { type User } from '../users.fixtures';
import { createTestUser, getAuth, shutdownEngine } from '../utils';
import sinon from 'sinon';
import { StorageDbManager } from '../storage-db-manager';
import { StorageGateway } from '../../../../lib/core/storage/StorageGateway';
import { sign } from 'jsonwebtoken';
import { NETWORK_TOKEN_AUDIENCE } from '../../../../lib/server/middleware/network-jwt';

const FAKE_UPLOAD_URL = 'http://fake-upload-url'
const FAKE_DOWNLOAD_URL = 'http://fake-download-url'
const FAKE_MULTIPART_DOWNLOAD_URLS = ['http://fake-download-url/part-1', 'http://fake-download-url/part-2']

describe('Bridge E2E Tests', () => {

  let testUser: User
  let axiosGetStub: sinon.SinonStub
  const databaseConnection = new StorageDbManager();

  beforeAll(async () => {
    await databaseConnection.connect();
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

  beforeEach(async () => {
    jest.clearAllMocks()
    axiosGetStub = sinon.stub(axios, 'get')
    axiosGetStub.callsFake(async (url: string) => {
      if (url.includes('/v2/upload/link')) return { data: { result: FAKE_UPLOAD_URL } }
      if (url.includes('/v2/upload-multipart/link')) {
        const parts = Number(new URL(url).searchParams.get('parts'))
        return { data: { result: new Array(parts).fill(FAKE_UPLOAD_URL), UploadId: 'fake-id' } }
      }
      if (url.includes('/v2/download/links')) {
        const keys = new URL(url).searchParams.get('keys') as string
        return { data: keys.split(',').map((key) => `${FAKE_DOWNLOAD_URL}/${key}`) }
      }
      if (url.includes('/v2/download/link')) return { data: { result: FAKE_DOWNLOAD_URL } }
      if (url.includes('/v2/download-multipart/link')) return { data: { result: FAKE_MULTIPART_DOWNLOAD_URLS } }
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

        expect(upload).toMatchObject({
          url: FAKE_UPLOAD_URL,
          urls: null,
          uuid: expect.any(String),
        })

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

        expect(firstUpload).toMatchObject({
          url: null,
          urls: [FAKE_UPLOAD_URL, FAKE_UPLOAD_URL],
          uuid: expect.any(String),
          UploadId: expect.any(String),
        })

        expect(secondUpload).toMatchObject({
          url: null,
          urls: [FAKE_UPLOAD_URL, FAKE_UPLOAD_URL],
          uuid: expect.any(String),
          UploadId: expect.any(String),
        })

      })

      it('When a user wants to upload a file with multiple parts, it should fail if is under 100MB', async () => {
        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))
          .expect(201)

        // Act: start the upload
        const MB99 = 99 * 1024 * 1024
        const fileParts = [{ index: 0, size: MB99 / 2, }, { index: 1, size: MB99 / 2, },]
        const response = await testServer.post(`/v2/buckets/${bucketId}/files/start?multiparts=${fileParts.length}`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: fileParts, })

        // Assert
        expect(response.status).toBe(400)
        expect(response.body.error).toBe('Multipart is not allowed for files smaller than 100MB')

      })

      it('When a user wants to upload a file with multiparts exceeding the maximum allowed, it should fail with 400', async () => {
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))
          .expect(201)

        const response = await testServer.post(`/v2/buckets/${bucketId}/files/start?multiparts=10001`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: [{ index: 0, size: 1000 }] })

        expect(response.status).toBe(400)
        expect(response.body.error).toBe('Invalid multiparts value')
      })

      it('When a user finishes to upload a file with single part upload, the user can finish the upload with a hash for the file', async () => {

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
        const responseComplete = await finishUpload(
          getAuth(testUser),
          bucketId,
          index,
          [{ hash: crypto.randomBytes(20).toString('hex'), uuid: upload.uuid }],
          { shardSize: 1000 },
        )

        // Assert
        expect(responseComplete.status).toBe(200);

        const body = responseComplete.body;

        expect(body).toMatchObject({
          bucket: bucketId,
          created: expect.any(String),
          filename: expect.any(String),
          index: index,
          id: expect.any(String),
          mimetype: 'application/octet-stream',
          renewal: expect.any(String),
          size: 1000,
          version: 2,
        })

      });

      it('When a user finishes to upload a file with multipart upload, the user can finish the upload with a hash per each part uploaded', async () => {

        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))

        // Arrange: start the upload
        const MB100 = 100 * 1024 * 1024
        const response = await testServer.post(`/v2/buckets/${bucketId}/files/start?multiparts=2`)
          .set('Authorization', getAuth(testUser))
          .send({ uploads: [{ index: 0, size: MB100 / 2, }, { index: 1, size: MB100 / 2, }] })

        const { uploads } = response.body;

        // Act: finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        const responseComplete = await finishUpload(
          getAuth(testUser),
          bucketId,
          index,
          (uploads as any[]).map((upload) => ({ hash: crypto.randomBytes(20).toString('hex'), uuid: upload.uuid })),
          { shardSize: MB100 / 2 },
        )

        // Assert
        expect(responseComplete.status).toBe(200);

        const body = responseComplete.body;

        expect(body).toMatchObject({
          bucket: bucketId,
          created: expect.any(String),
          filename: expect.any(String),
          index: index,
          id: expect.any(String),
          mimetype: 'application/octet-stream',
          renewal: expect.any(String),
          size: MB100,
          version: 2,
        })

      });


      it('When an user finished to upload a file, then file size should be added to the used space', async () => {
        // Arrange: Create a user with some used space
        const originalUser = await createTestUser();
        const previousTotalUsedSpace = 10000;
        await databaseConnection.models.User.updateOne({ uuid: originalUser.uuid }, { totalUsedSpaceBytes: previousTotalUsedSpace });

        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(originalUser))

        // Arrange: start the upload
        const MB100 = 100 * 1024 * 1024
        const response = await testServer.post(`/v2/buckets/${bucketId}/files/start?multiparts=2`)
          .set('Authorization', getAuth(originalUser))
          .send({ uploads: [{ index: 0, size: MB100 / 2, }, { index: 1, size: MB100 / 2, }] })

        const { uploads } = response.body;

        // Act: finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        await finishUpload(
          getAuth(originalUser),
          bucketId,
          index,
          (uploads as any[]).map((upload) => ({ hash: crypto.randomBytes(20).toString('hex'), uuid: upload.uuid })),
          { shardSize: MB100 / 2 },
        )

        const userInDb = await databaseConnection.models.User.findOne({ uuid: originalUser.uuid });
        expect(userInDb).not.toBeNull();
        expect(userInDb.totalUsedSpaceBytes).toEqual(previousTotalUsedSpace + MB100);
      });


      it('When an user tries to upload a file bigger than the free space, then it should fail', async () => {
        // Arrange: Create user with insufficient space for upload
        const user = await createTestUser();
        const MB100 = 100 * 1024 * 1024;
        const uploadSize = MB100 * 2; // 200MB

        // Set used space to leave insufficient room (1 byte short)
        const usedSpace = user.maxSpaceBytes - uploadSize + 1;
        await databaseConnection.models.User.updateOne(
          { uuid: user.uuid },
          { totalUsedSpaceBytes: usedSpace }
        );

        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(user))

        // Act: Attempt upload that exceeds available space
        const response = await testServer.post(`/v2/buckets/${bucketId}/files/start?multiparts=2`)
          .set('Authorization', getAuth(user))
          .send({ uploads: Array.from({ length: 2 }, (_, index) => ({ index, size: MB100 })) })

        expect(response.status).toBe(420);
      });
    })

    describe('Downloading a file', () => {
      const createBucket = async (user: User) => {
        const { body: { id } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(user))

        return id as string
      }

      const uploadFile = async (user: User, bucketId: string) => {
        const { body: { uploads: [upload] } } = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(user))
          .send({ uploads: [{ index: 0, size: 1000, }], })

        const index = crypto.randomBytes(32).toString('hex');
        const hash = crypto.randomBytes(20).toString('hex')
        const { body: file } = await finishUpload(
          getAuth(user),
          bucketId,
          index,
          [{ hash, uuid: upload.uuid }],
          { shardSize: 1000 },
        )

        return { id: file.id as string, index, hash, uuid: upload.uuid as string }
      }

      it('When a part size is requested, then it should get the file info with a download link per part', async () => {
        const user = await createTestUser();
        const bucketId = await createBucket(user)
        const file = await uploadFile(user, bucketId)

        const response = await testServer.get(`/buckets/${bucketId}/files/${file.id}/info?partSize=5242880`)
          .set('Authorization', getAuth(user))

        expect(response.status).toBe(200);
        expect(response.body.shards).toStrictEqual([
          { index: 0, hash: file.hash, url: FAKE_MULTIPART_DOWNLOAD_URLS },
        ])

        const requestedUrls = axiosGetStub.getCalls().map((call) => call.args[0])

        expect(requestedUrls).toContainEqual(
          expect.stringContaining(`/v2/download-multipart/link/${file.uuid}?partSize=5242880`)
        )
      })

      it('When the part size is not a number, then it should fail', async () => {
        const user = await createTestUser();
        const bucketId = await createBucket(user)
        const file = await uploadFile(user, bucketId)

        const response = await testServer.get(`/buckets/${bucketId}/files/${file.id}/info?partSize=invalid`)
          .set('Authorization', getAuth(user))

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid "partSize" query parameter');
      })

      it('When requesting several files at once, then it should return their links in the requested order', async () => {
        const user = await createTestUser();
        const bucketId = await createBucket(user)
        const firstFile = await uploadFile(user, bucketId)
        const secondFile = await uploadFile(user, bucketId)

        const response = await testServer.get(`/buckets/${bucketId}/bulk-files?fileIds=${secondFile.id},${firstFile.id}`)
          .set('Authorization', getAuth(user))

        expect(response.status).toBe(200);
        expect(response.body).toStrictEqual([
          { fileId: secondFile.id, link: `${FAKE_DOWNLOAD_URL}/${secondFile.uuid}`, index: secondFile.index },
          { fileId: firstFile.id, link: `${FAKE_DOWNLOAD_URL}/${firstFile.uuid}`, index: firstFile.index },
        ])
      })

      it('When requesting several files without their ids, then it should fail', async () => {
        const user = await createTestUser();
        const bucketId = await createBucket(user)

        const response = await testServer.get(`/buckets/${bucketId}/bulk-files`)
          .set('Authorization', getAuth(user))

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Fileids query parameter must be defined');
      })

      it('When the file ids parameter is repeated, then it should fail', async () => {
        const user = await createTestUser();
        const bucketId = await createBucket(user)
        const file = await uploadFile(user, bucketId)

        const response = await testServer.get(`/buckets/${bucketId}/bulk-files?fileIds=${file.id}&fileIds=${file.id}`)
          .set('Authorization', getAuth(user))

        expect(response.status).toBe(500);
      })

      it('When a user uploads a file, then it should be able to get download links', async () => {
        const user = await createTestUser();

        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(user))

        // Arrange: start the upload
        const { body: { uploads: [upload] } } = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(user))
          .send({ uploads: [{ index: 0, size: 1000, }], })

        // Arrange: finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        const fileHash = crypto.randomBytes(20).toString('hex')
        const { body: file } = await finishUpload(
          getAuth(user),
          bucketId,
          index,
          [{ hash: fileHash, uuid: upload.uuid }],
          { shardSize: 1000 },
        )

        // Act
        const response = await testServer.get(`/buckets/${bucketId}/files/${file.id}/info`)
          .set('Authorization', getAuth(user))

        // Assert
        expect(response.status).toBe(200);

        const { body: fileInfo } = response

        expect(fileInfo).toMatchObject({
          bucket: bucketId,
          created: expect.any(String),
          filename: expect.any(String),
          index,
          id: expect.any(String),
          mimetype: 'application/octet-stream',
          renewal: expect.any(String),
          size: 1000,
          version: 2,
          shards: [{ index: 0, hash: fileHash, url: expect.any(String), }]
        })
      })
    })

    describe('Using a network token', () => {
      const networkTokenSecret: string = engine._config.network?.JWT_SECRET

      let owner: User
      let ownerBucketId: string

      const buildNetworkToken = (
        claims: { uuid?: string, bucket?: string, iat?: number } = {},
        { key = networkTokenSecret, expiresIn = 60 * 60 }: { key?: string, expiresIn?: number } = {},
      ) => sign({ uuid: owner.uuid, bucket: ownerBucketId, ...claims }, key, {
        algorithm: 'HS256',
        audience: NETWORK_TOKEN_AUDIENCE,
        expiresIn,
      })

      const networkAuth = (token: string) => `Basic ${Buffer.from(`network-token:${token}`).toString('base64')}`

      const createBucket = async (user: User): Promise<string> => {
        const { body: { id } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(user))
          .expect(201)

        return id
      }

      const startUpload = (auth: string, bucketId: string) => testServer
        .post(`/v2/buckets/${bucketId}/files/start`)
        .set('Authorization', auth)
        .send({ uploads: [{ index: 0, size: 1000 }] })

      const finishSinglePartUpload = (auth: string, bucketId: string, uuid: string) => finishUpload(
        auth,
        bucketId,
        crypto.randomBytes(32).toString('hex'),
        [{ hash: crypto.randomBytes(20).toString('hex'), uuid }],
        { shardSize: 1000 },
      )

      const uploadFile = async (auth: string, bucketId: string): Promise<string> => {
        const { body: { uploads: [upload] } } = await startUpload(auth, bucketId).expect(200)
        const { status, body: file } = await finishSinglePartUpload(auth, bucketId, upload.uuid)

        if (status !== 200) {
          throw new Error(`Upload could not be finished: ${status}`)
        }

        return file.id
      }

      beforeAll(async () => {
        if (!networkTokenSecret) {
          throw new Error('Missing inxtbridge_network__JWT_SECRET for network token e2e tests')
        }

        owner = await createTestUser()
        ownerBucketId = await createBucket(owner)
      })

      describe('Uploading a file', () => {
        it('When the token is valid for the bucket, then the user can start and finish the upload', async () => {
          const auth = networkAuth(buildNetworkToken())

          const startResponse = await startUpload(auth, ownerBucketId)

          expect(startResponse.status).toBe(200)
          const [upload] = startResponse.body.uploads
          expect(upload).toMatchObject({ url: FAKE_UPLOAD_URL, uuid: expect.any(String) })

          const finishResponse = await finishSinglePartUpload(auth, ownerBucketId, upload.uuid)

          expect(finishResponse.status).toBe(200)
          expect(finishResponse.body).toMatchObject({ bucket: ownerBucketId, size: 1000, version: 2 })
        })

        it('When the token was issued for another bucket, then the upload is forbidden', async () => {
          const anotherBucketId = await createBucket(owner)
          const auth = networkAuth(buildNetworkToken())

          const startResponse = await startUpload(auth, anotherBucketId)
          const finishResponse = await finishSinglePartUpload(auth, anotherBucketId, crypto.randomUUID())

          expect(startResponse.status).toBe(403)
          expect(finishResponse.status).toBe(403)
        })

        it('When the token user does not own the bucket, then the upload is forbidden', async () => {
          const attacker = await createTestUser()

          const response = await startUpload(networkAuth(buildNetworkToken({ uuid: attacker.uuid })), ownerBucketId)

          expect(response.status).toBe(403)
        })
      })

      describe('Getting file info', () => {
        it('When the token is valid for the bucket, then the user gets the file info with download links', async () => {
          const fileId = await uploadFile(getAuth(owner), ownerBucketId)

          const response = await testServer
            .get(`/buckets/${ownerBucketId}/files/${fileId}/info`)
            .set('Authorization', networkAuth(buildNetworkToken()))

          expect(response.status).toBe(200)
          expect(response.body).toMatchObject({
            bucket: ownerBucketId,
            id: fileId,
            shards: [{ index: 0, hash: expect.any(String), url: expect.any(String) }],
          })
        })

        it('When the token was issued for another bucket, then getting the file info is forbidden', async () => {
          const anotherBucketId = await createBucket(owner)
          const fileId = await uploadFile(getAuth(owner), anotherBucketId)

          const response = await testServer
            .get(`/buckets/${anotherBucketId}/files/${fileId}/info`)
            .set('Authorization', networkAuth(buildNetworkToken()))

          expect(response.status).toBe(403)
        })

        it('When the token user does not own the bucket, then the file is not found', async () => {
          const fileId = await uploadFile(getAuth(owner), ownerBucketId)
          const attacker = await createTestUser()

          const response = await testServer
            .get(`/buckets/${ownerBucketId}/files/${fileId}/info`)
            .set('Authorization', networkAuth(buildNetworkToken({ uuid: attacker.uuid })))

          expect(response.status).toBe(404)
        })
      })

      describe('Rejecting invalid tokens', () => {
        const nowInSeconds = () => Math.floor(Date.now() / 1000)

        it.each([
          ['has expired', () => buildNetworkToken({}, { expiresIn: -120 })],
          ['was issued more than 2 hours ago', () => buildNetworkToken({ iat: nowInSeconds() - 3 * 60 * 60 }, { expiresIn: 4 * 60 * 60 })],
          ['is signed with another secret', () => buildNetworkToken({}, { key: 'another-secret' })],
          ['belongs to a user that does not exist', () => buildNetworkToken({ uuid: crypto.randomUUID() })],
          ['is malformed', () => 'not-a-jwt'],
        ])('When the token %s, then the upload is not authorized', async (_: string, buildInvalidToken: () => string) => {
          const response = await startUpload(networkAuth(buildInvalidToken()), ownerBucketId)

          expect(response.status).toBe(401)
        })
      })

      describe('Routes that do not accept network tokens', () => {
        it('When listing buckets with a valid token, then it is not authorized', async () => {
          const response = await testServer
            .get('/buckets')
            .set('Authorization', networkAuth(buildNetworkToken()))

          expect(response.status).toBe(401)
        })

        it('When deleting a file with a valid token, then it is not authorized and the file is kept', async () => {
          const fileId = await uploadFile(getAuth(owner), ownerBucketId)

          const response = await testServer
            .delete(`/buckets/${ownerBucketId}/files/${fileId}`)
            .set('Authorization', networkAuth(buildNetworkToken()))

          expect(response.status).toBe(401)
          await testServer
            .get(`/buckets/${ownerBucketId}/files/${fileId}/info`)
            .set('Authorization', getAuth(owner))
            .expect(200)
        })

        it('When getting the v2 download links with a valid token, then it is not authorized', async () => {
          const fileId = await uploadFile(getAuth(owner), ownerBucketId)

          const response = await testServer
            .get(`/v2/buckets/${ownerBucketId}/files/${fileId}/mirrors`)
            .set('Authorization', networkAuth(buildNetworkToken()))

          expect(response.status).toBe(401)
        })
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
          .send({ uploads: [{ index: 0, size: 1000, }, { index: 1, size: 1000, },], })

        // Arrange: finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        const { body: file } = await finishUpload(
          getAuth(testUser),
          bucketId,
          index,
          (uploads as any[]).map(upload => ({ hash: crypto.randomBytes(20).toString('hex'), uuid: upload.uuid })),
          { shardSize: 1000 },
        )

        // Act: remove the file
        const response = await testServer.delete(`/buckets/${bucketId}/files/${file.id}`)
          .set('Authorization', getAuth(testUser))

        // Assert
        expect(response.status).toBe(204);

      })

      it('When a user wants to delete a file, it should fail if the file does not exist', async () => {
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

      it('When a user deletes a file and it succeeds, then it should subtract the file size from user total used space', async () => {
        const user = await createTestUser();
        const MB100 = 100 * 1024 * 1024;
        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(user))

        // Arrange: start the upload
        const { body: { uploads } } = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(user))
          .send({ uploads: [{ index: 0, size: MB100 / 2, }, { index: 1, size: MB100 / 2, },], })

        // Arrange: finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        const { body: file } = await finishUpload(
          getAuth(user),
          bucketId,
          index,
          (uploads as any[]).map(upload => ({ hash: crypto.randomBytes(20).toString('hex'), uuid: upload.uuid })),
          { shardSize: MB100 / 2 },
        )

        // Arrange: get the user before deleting the file
        const userWithFileUploaded = await databaseConnection.models.User.findOne({ uuid: user.uuid });

        // Act: remove the file
        const response = await testServer.delete(`/buckets/${bucketId}/files/${file.id}`)
          .set('Authorization', getAuth(user))

        // Assert
        expect(response.status).toBe(204);
        const userAfterFileDeleted = await databaseConnection.models.User.findOne({ uuid: user.uuid });
        expect(userWithFileUploaded.totalUsedSpaceBytes).toEqual(MB100);
        expect(userAfterFileDeleted.totalUsedSpaceBytes).toEqual(0);
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

        expect(body).toMatchObject({
          bucket: bucketId,
          operation: 'PULL',
          expires: expect.any(String),
          token: expect.any(String),
          id: expect.any(String),
          encryptionKey: expect.any(String),
        })

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
        const { body: file } = await finishUpload(
          getAuth(testUser),
          bucketId,
          index,
          [{ hash: crypto.randomBytes(20).toString('hex'), uuid: upload.uuid }],
          { shardSize: 1000 },
        )

        // Act
        const response = await testServer.post(`/buckets/${bucketId}/tokens`)
          .set('Authorization', getAuth(testUser))
          .send({ operation: 'PULL', file: file.id })

        // Assert
        expect(response.status).toBe(201);

        const { body } = response

        expect(body).toMatchObject({
          bucket: bucketId,
          operation: 'PULL',
          expires: expect.any(String),
          token: expect.any(String),
          id: expect.any(String),
          encryptionKey: expect.any(String),
          mimetype: 'application/octet-stream',
          size: 1000,
        })

      })

      it('When a user wants to share a file using tokens, then the file should be downloadable using created tokens', async () => {
        const user = await createTestUser();

        // Arrange: Create a bucket
        const { body: { id: bucketId } } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(user))

        // Arrange: Start the upload
        const { body: { uploads: [upload] } } = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
          .set('Authorization', getAuth(user))
          .send({ uploads: [{ index: 0, size: 1000, }], })

        // Arrange: Finish the upload
        const index = crypto.randomBytes(32).toString('hex');
        const fileHash = crypto.randomBytes(20).toString('hex')
        const { body: file } = await finishUpload(
          getAuth(user),
          bucketId,
          index,
          [{ hash: fileHash, uuid: upload.uuid }],
          { shardSize: 1000 },
        )

        // Arrange: Create a Token
        const tokenResponse = await testServer.post(`/buckets/${bucketId}/tokens`)
          .set('Authorization', getAuth(user))
          .send({ operation: 'PULL', file: file.id });

        // Act: Download the file using the token
        const fileInfoResponse = await testServer.get(`/buckets/${bucketId}/files/${file.id}/info`)
          .set('x-token', tokenResponse.body.token)

        expect(fileInfoResponse.body).toMatchObject({
          bucket: bucketId,
          created: expect.any(String),
          filename: expect.any(String),
          index,
          id: expect.any(String),
          mimetype: 'application/octet-stream',
          renewal: expect.any(String),
          size: 1000,
          version: 2,
          shards: [{ index: 0, hash: fileHash, url: expect.any(String), }]
        })
      })
    })
  })
});

type Shard = { hash: string; uuid: string }
type FinishUploadOpts = {
  /** Size each shard was uploaded with. Used as the default farmer response. */
  shardSize: number
  /**
   * Size the farmer reports back. Defaults to `shardSize` so validation passes.
   * Set to a different value to test size mismatch errors, or `null` to simulate
   * the object not found in storage.
   */
  farmerReportedSize?: number | null
}

const finishUpload = async (
  auth: string,
  bucketId: string,
  index: string,
  shards: Shard[],
  { shardSize, farmerReportedSize = shardSize }: FinishUploadOpts,
) => {
  const mockReturnValue = farmerReportedSize === null ? null : { size: farmerReportedSize }
  const getMetaMock = jest.spyOn(StorageGateway, 'getMeta').mockResolvedValue(mockReturnValue)
  const response = await testServer
    .post(`/v2/buckets/${bucketId}/files/finish`)
    .set('Authorization', auth)
    .send({ index, shards })
  getMetaMock.mockRestore()
  return response
}