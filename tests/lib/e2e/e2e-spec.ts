import supertest from 'supertest'
import { checkConnection, cleanDataBase, createTestUser, getAuth, testUser } from './utils'
// Remove jest args so there is no conflict with storj-bridge
process.argv = process.argv.slice(0, 2)
const engine = require('../../../bin/storj-bridge')

import sendGridMail from '@sendgrid/mail'

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn((_, __, done) => typeof done === 'function' ? done() : Promise.resolve()),
}))

const dispatchSendGridMock = jest.fn((_, __, ___, cb) => {
  sendGridMail.send(null as any, null as any, cb)
})
engine.mailer.dispatchSendGrid = dispatchSendGridMock

checkConnection(engine.storage)

describe('Bridge E2E Tests', () => {

  beforeEach(() => {
    jest.clearAllMocks()
  })

  beforeAll(() => {
    cleanDataBase(engine.storage)
  })

  afterAll(() => {
    cleanDataBase(engine.storage)
  })

  describe('Buckets', () => {

    beforeAll(async () => {
      await createTestUser(engine.storage)
    })

    it('should create a bucket', async () => {

      const response = await supertest(engine.server.app)
        .post('/buckets')
        .set('Authorization', getAuth(testUser))
        .send({
          pubkeys: ['031a259ee122414f57a63bbd6887ee17960e9106b0adcf89a298cdad2108adf4d9'],
          name: 'test-bucket-name'
        })
        .expect(201);

      const buckets = await engine.storage.models.Bucket.find({ _id: response.body.id })

      expect(buckets).toHaveLength(1)

    })


    it('should update a bucket', async () => {

      const { body: bucket } = await supertest(engine.server.app)
        .post('/buckets')
        .set('Authorization', getAuth(testUser))
        .send({
          pubkeys: ['031a259ee122414f57a63bbd6887ee17960e9106b0adcf89a298cdad2108adf4d9'],
          name: 'test-bucket-name-1'
        })
        .expect(201);

      const response = await supertest(engine.server.app)
        .patch(`/buckets/${bucket.id}`)
        .set('Authorization', getAuth(testUser))
        .send({ pubkeys: [] })
        .expect(200);


      const dbBucket = await engine.storage.models.Bucket.findOne({ _id: response.body.id })

      expect(dbBucket.toObject().pubkeys).toEqual([])

    })

    it('should delete a bucket', async () => {

      const { body: bucket } = await supertest(engine.server.app)
        .post('/buckets')
        .set('Authorization', getAuth(testUser))
        .send({
          pubkeys: ['031a259ee122414f57a63bbd6887ee17960e9106b0adcf89a298cdad2108adf4d9'],
          name: 'test-bucket-name-2'
        })
        .expect(201);

      await supertest(engine.server.app)
        .delete(`/buckets/${bucket.id}`)
        .set('Authorization', getAuth(testUser))
        .expect(204)

      const users = await engine.storage.models.Bucket.findOne({ _id: bucket.id })

      expect(users).toBeNull()

    })
  })

  describe('Users', () => {

    describe('v1', () => {
      it('should create a user', async () => {

        const response = await supertest(engine.server.app)
          .post('/users')
          .send({ email: 'test' + testUser.email, password: testUser.hashpass })
          .expect(201);

        const users = await engine.storage.models.User.find({ _id: response.body.id })

        expect(users).toHaveLength(1)

        expect(users[0].toObject().activated).toBe(true)

        // expect(dispatchSendGridMock).toHaveBeenCalled()

      })

      it('should delete a user', async () => {

        // Create User
        const { body: user } = await supertest(engine.server.app)
          .post('/users')
          .send({ email: 'test3' + testUser.email, password: testUser.hashpass, })
          .expect(201);

        // Request Deactivation
        await supertest(engine.server.app)
          .delete(`/users/${user.email}?deactivator=test-deactivator-token&redirect=/`)
          .set('Authorization', getAuth({ email: user.email, hashpass: testUser.hashpass }))
          .expect(200)

        const dbUser = await engine.storage.models.User.findOne({ _id: user.id })
        expect(dbUser).not.toBeNull()

        const token = dbUser.toObject().deactivator
        expect(token).toBe('test-deactivator-token')

        expect(sendGridMail.send).toHaveBeenCalled()

        // Confirm Deactivation
        await supertest(engine.server.app)
          .get(`/deactivations/${token}`)
          .expect(200)

        const dbUserAfterDeactivation = await engine.storage.models.User.findOne({ _id: user.id })
        expect(dbUserAfterDeactivation).toBeNull()
      })

    })
    describe('v2', () => {
      it('should create a user', async () => {
        const response = await supertest(engine.server.app)
          .post('/v2/users')
          .send({ email: 'test_v2' + testUser.email, password: testUser.hashpass })
          // .expect(201);
          .expect(200);

        const users = await engine.storage.models.User.find({ _id: response.body.id })

        expect(users).toHaveLength(1)

        expect(users[0].toObject().activated).toBe(true)
      })

      it('should delete a user', async () => {

        const testEmail = 'test_v2_4' + testUser.email
        // Create User
        const { body: user } = await supertest(engine.server.app)
          .post('/v2/users')
          .send({ email: testEmail, password: testUser.hashpass, })
          // .expect(201)
          .expect(200);


        // Request Deactivation
        await supertest(engine.server.app)
          .delete(`/v2/users/request-deactivate?deactivator=test-deactivator-token&redirect=/`)
          .set('Authorization', getAuth({ email: testEmail, hashpass: testUser.hashpass }))
          .expect(200)

        const dbUser = await engine.storage.models.User.findOne({ _id: user.id })
        expect(dbUser).not.toBeNull()

        const token = dbUser.toObject().deactivator
        expect(token).toBe('test-deactivator-token')

        expect(sendGridMail.send).toHaveBeenCalled()

        // Confirm Deactivation
        await supertest(engine.server.app)
          .delete(`/v2/users/confirm-deactivate/${token}`)
          .expect(200)

        const dbUserAfterDeactivation = await engine.storage.models.User.findOne({ _id: user.id })
        expect(dbUserAfterDeactivation).toBeNull()
      })

    })
  })
  afterAll(() => {
    process.emit('SIGINT')
  })
})

