// import crypto from 'crypto';
import { createTestUser, deleteTestUser, getAuth, } from '../utils'
import { engine, testServer } from '../setup'
// import axios, { type AxiosStatic } from 'axios'
import { type User } from '../users.fixtures';


jest.mock('axios', () => ({ get: jest.fn() }))

describe('Bridge E2E Tests', () => {

  let testUser: User
  beforeAll(async () => {
    await engine.storage.models.Bucket.deleteMany({})
    testUser = await createTestUser()
  })

  afterAll(async () => {
    await engine.storage.models.Bucket.deleteMany({})
    await deleteTestUser()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Buckets Management', () => {

    describe('Bucket creation v1', () => {

      it('should create a bucket with name and pubkeys', async () => {

        // Act
        const response = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))
          .send({
            pubkeys: ['031a259ee122414f57a63bbd6887ee17960e9106b0adcf89a298cdad2108adf4d9'],
            name: 'test-bucket-name'
          })

        // Assert
        expect(response.status).toBe(201)
        expect(response.body).toHaveProperty('id')

        const buckets = await engine.storage.models.Bucket.find({ _id: response.body.id })
        expect(buckets).toHaveLength(1)

      })
    })

    describe('Bucket update v1', () => {

      it('should be able to update a bucket to empty pubkeys', async () => {
        // Arrange
        const { body: bucket } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))
          .send({
            pubkeys: ['031a259ee122414f57a63bbd6887ee17960e9106b0adcf89a298cdad2108adf4d9'],
            name: 'test-bucket-name-1'
          })
          .expect(201);

        // Act


        const response = await testServer
          .patch(`/buckets/${bucket.id}`)
          .set('Authorization', getAuth(testUser))
          .send({ pubkeys: [] })


        // Assert
        expect(response.status).toBe(200);

        const dbBucket = await engine.storage.models.Bucket.findOne({ _id: response.body.id })
        expect(dbBucket.toObject().pubkeys).toEqual([])

      })
    })

    describe('Bucket deletion v1', () => {
      it('should be able to delete a bucket', async () => {

        // Arrange: Create a bucket
        const { body: bucket } = await testServer
          .post('/buckets')
          .set('Authorization', getAuth(testUser))
          .send({
            pubkeys: ['031a259ee122414f57a63bbd6887ee17960e9106b0adcf89a298cdad2108adf4d9'],
            name: 'test-bucket-name-2'
          })
          .expect(201);

        // Act: Delete the bucket
        const response = await testServer
          .delete(`/buckets/${bucket.id}`)
          .set('Authorization', getAuth(testUser))


        // Assert
        expect(response.status).toBe(204)
        const buckets = await engine.storage.models.Bucket.findOne({ _id: bucket.id })
        expect(buckets).toBeNull()

      })
    })
  })

  // describe('File Management', () => {

  //   describe('File upload v1', () => {

  //     it('Uploads and finishes correctly', async () => {

  //       const nodeID = engine._config.application.CLUSTER['0']

  //       const get = axios.get as jest.MockWithArgs<AxiosStatic>

  //       get.mockResolvedValue(Promise.resolve({ data: { result: 'http://fake-url' } } as any))

  //       await new Promise(resolve => engine.storage.models.Contact.record({
  //         nodeID,
  //         protocol: "1.2.0-INXT",
  //         address: "72.132.43.2", // this ip address is an example
  //         port: 43758,
  //         lastSeen: new Date(),
  //       }, resolve))

  //       const { body: { id: bucketId } } = await testServer
  //         .post('/buckets')
  //         .set('Authorization', getAuth(testUser))


  //       const response = await testServer.post(`/v2/buckets/${bucketId}/files/start`)
  //         .set('Authorization', getAuth(testUser))
  //         .send({ uploads: [{ index: 0, size: 1000, }, { index: 1, size: 10000, },], })


  //       console.log({ body: { ...response.body } });

  //       const { uploads } = response.body;

  //       for (const upload of uploads) {
  //         const { url, urls, index, uuid } = upload;
  //         expect(url).toBeDefined();
  //         expect(url).toContain('http');
  //         expect(url).toBe('http://fake-url')
  //         expect(urls).toBeNull();
  //         expect(uuid).toBeDefined();
  //         const file = crypto.randomBytes(50).toString('hex');
  //         // await axios.put(url, file, { headers: { 'Content-Type': 'application/octet-stream', }, });
  //       }

  //       const index = crypto.randomBytes(32).toString('hex');
  //       const responseComplete = await testServer.post(`/v2/buckets/${bucketId}/files/finish`)
  //         .set('Authorization', getAuth(testUser))
  //         .send({
  //           index,
  //           shards: [
  //             { hash: crypto.randomBytes(20).toString('hex'), uuid: uploads[0].uuid, },
  //             { hash: crypto.randomBytes(20).toString('hex'), uuid: uploads[1].uuid, },
  //           ],
  //         });

  //       expect(responseComplete.status).toBe(200);

  //       const {
  //         bucket,
  //         created,
  //         filename,
  //         id,
  //         index: indexResponse,
  //         mimetype,
  //         renewal,
  //         size,
  //         version,
  //       } = responseComplete.body;

  //       expect(bucket).toEqual(bucketId);
  //       expect(created).toBeDefined();
  //       expect(filename).toBeDefined();
  //       expect(id).toBeDefined();
  //       expect(indexResponse).toEqual(index);
  //       expect(mimetype).toBeDefined();
  //       expect(renewal).toBeDefined();
  //       expect(size).toBeGreaterThan(0);
  //       expect(typeof size).toBe('number');
  //       expect(version).toBe(2);
  //     });
  //   })

  // })

})

