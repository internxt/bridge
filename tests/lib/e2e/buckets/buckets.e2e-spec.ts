import { createTestUser, deleteTestUser, getAuth, testUser, } from '../utils'

import { engine, testServer } from '../setup'



describe('Bridge E2E Tests', () => {

  beforeAll(async () => {
    await engine.storage.models.Bucket.deleteMany({})
  })

  afterAll(async () => {
    await engine.storage.models.Bucket.deleteMany({})
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Buckets Management', () => {

    beforeAll(async () => {
      await createTestUser(engine.storage)
    })

    afterAll(async () => {
      await deleteTestUser(engine.storage)
    })

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

})

