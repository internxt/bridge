import { dataGenerator } from './../users.fixtures'
import { cleanUpTestUsers, createTestUser, getAuth, shutdownEngine, } from '../utils'
import { engine, testServer } from '../setup'
import { type User } from '../users.fixtures';


describe('Bridge E2E Tests', () => {

  let testUser: User
  beforeAll(async () => {
    testUser = await createTestUser()
  })

  afterAll(async () => {
    await cleanUpTestUsers()
    await shutdownEngine()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Buckets Management', () => {

    describe('Bucket Management v1', () => {

      describe('Creating a bucket', () => {

        it('When you want to create the root bucket, it should work without any arguments', async () => {

          // Act
          const response = await testServer
            .post('/buckets')
            .set('Authorization', getAuth(testUser))

          // Assert
          expect(response.status).toBe(201)
          expect(response.body).toHaveProperty('id')

          const bucket = await engine.storage.models.Bucket.findOne({ _id: response.body.id })
          expect(bucket).not.toBeNull()

        })
        it('When you want to create a bucket with name and pubkeys, it should work with correctly formatted pubkeys', async () => {
          const bucketPubKey = '031a259ee122414f57a63bbd6887ee17960e9106b0adcf89a298cdad2108adf4d9';

          // Act
          const response = await testServer
            .post('/buckets')
            .set('Authorization', getAuth(testUser))
            .send({
              pubkeys: [bucketPubKey],
              name: 'test-bucket-name'
            })

          // Assert
          expect(response.status).toBe(201)
          expect(response.body).toHaveProperty('id')

          const bucket = await engine.storage.models.Bucket.findOne({ _id: response.body.id })
          expect(bucket).not.toBeNull()

        })
        it('When you want to create a bucket with name and pubkeys, it should fail with incorrectly formatted pubkeys', async () => {

          // Act
          const response = await testServer
            .post('/buckets')
            .set('Authorization', getAuth(testUser))
            .send({
              pubkeys: ['invalid-pubkey'],
              name: 'test-bucket-name'
            })

          // Assert
          expect(response.status).toBe(400)

        })
      })

      describe('Updating a bucket', () => {

        it('When you want to update a bucket, it should work with empty pubkeys list', async () => {
          // Arrange
          const { body: bucket } = await testServer
            .post('/buckets')
            .set('Authorization', getAuth(testUser))
            .send({
              pubkeys: ['031a259ee122414f57a63bbd6887ee17960e9106b0adcf89a298cdad2108adf4d9'],
              name: dataGenerator.word({ length: 7 })
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
        
        it('When you want to update a bucket, it should fail with invalid pubkeys list', async () => {
          const bucketPubKey = '031a259ee122414f57a63bbd6887ee17960e9106b0adcf89a298cdad2108adf4d9';
          // Arrange
          const { body: bucket } = await testServer
            .post('/buckets')
            .set('Authorization', getAuth(testUser))
            .send({
              pubkeys: [bucketPubKey],
              name: dataGenerator.word({ length: 7 })
            })
            .expect(201);

          // Act
          const response = await testServer
            .patch(`/buckets/${bucket.id}`)
            .set('Authorization', getAuth(testUser))
            .send({ pubkeys: ['invalid-pubkey'] })


          // Assert
          expect(response.status).toBe(400);

          const dbBucket = await engine.storage.models.Bucket.findOne({ _id: bucket.id })
          expect(dbBucket.toObject().pubkeys).toEqual([bucketPubKey])

        })
      })

      describe('Deleting a bucket', () => {
        it('When you want to delete a bucket it should work if is the owner', async () => {
          const bucketPubKey = '03fff97bd5755eeea420453a14355235d382f6472f8568a18b2f057a1460297556'
          const bucketName = dataGenerator.word({ length: 7 });

          // Arrange: Create a bucket
          const { body: bucket } = await testServer
            .post('/buckets')
            .set('Authorization', getAuth(testUser))
            .send({
              pubkeys: [bucketPubKey],
              name: bucketName
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

        it('When you want to delete a bucket it should fail if is not the owner', async () => {

          // Arrange: Create a bucket
          const owner = await createTestUser({ user: { email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }), maxSpaceBytes: 321312313 } })
          const notTheOwner = testUser

          const { body: bucket } = await testServer
            .post('/buckets')
            .set('Authorization', getAuth(owner))
            .send({
              pubkeys: ['031a259ee122414f57a63bbd6887ee17960e9106b0adcf89a298cdad2108adf4d9'],
              name: dataGenerator.word({ length: 7 })
            })
            .expect(201);

          // Act: Delete the bucket
          const response = await testServer
            .delete(`/buckets/${bucket.id}`)
            .set('Authorization', getAuth(notTheOwner))


          // Assert
          expect(response.status).toBe(404)

        })
      })
    })
  })



})

