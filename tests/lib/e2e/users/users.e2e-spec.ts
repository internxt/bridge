import { getAuth, } from '../utils'

import sendGridMail from '@sendgrid/mail'
import { engine, testServer } from '../setup'
import { dataGenerator } from '../users.fixtures'


// NB: Mock SendGrid
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn((_, __, done) => typeof done === 'function' ? done() : Promise.resolve()),
}))

// NB: Mock JWT verification
jest.mock('jsonwebtoken', () => ({ verify: jest.fn((_, __, ___, cb) => cb(null, {})) }))

describe('Bridge E2E Tests', () => {

  beforeAll(async () => {
    await engine.storage.models.User.deleteMany({})
  })

  afterAll(async () => {
    await engine.storage.models.User.deleteMany({})
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Users Management', () => {

    describe('User creation v1', () => {
      it('should create a user with email and password', async () => {

        // Act
        const response = await testServer
          .post('/users')
          .send({ email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }) })

        // Assert
        expect(response.status).toBe(201);
        const users = await engine.storage.models.User.find({ _id: response.body.id })
        expect(users).toHaveLength(1)

        expect(users[0].toObject().activated).toBe(true)

        // expect(dispatchSendGridMock).toHaveBeenCalled()

      })
    })

    describe('User deletion v1', () => {
      it('should be able to request a user deactivation', async () => {

        // Arrange: Mock SendGrid call
        engine.mailer.dispatchSendGrid = jest.fn((_, __, ___, cb) => { sendGridMail.send(null as any, null as any, cb) })

        // Arrange: Create User
        const payload = { email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }), }
        const { body: user } = await testServer
          .post('/users')
          .send(payload)
          .expect(201);

        // Act: Request Deactivation
        const deactivatorHash = dataGenerator.hash()
        const response = await testServer
          .delete(`/users/${user.email}?deactivator=${deactivatorHash}&redirect=/`)
          .set('Authorization', getAuth(payload))

        // Assert
        expect(response.status).toBe(200)
        const dbUser = await engine.storage.models.User.findOne({ _id: user.id })
        expect(dbUser).not.toBeNull()

        const token = dbUser.toObject().deactivator
        expect(token).toBe(deactivatorHash)

        expect(sendGridMail.send).toHaveBeenCalled()


      })

      it('should be able to confirm a user deactivation', async () => {

        // Arrange: Create User
        const payload = { email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }), }
        const { body: user } = await testServer
          .post('/users')
          .send(payload)
          .expect(201);


        // Arrange: Request Deactivation
        const token = dataGenerator.hash()
        await testServer
          .delete(`/users/${user.email}?deactivator=${token}&redirect=/`)
          .set('Authorization', getAuth(payload))
          .expect(200)

        // Act: Confirm Deactivation
        const response = await testServer.get(`/deactivations/${token}`)

        // Assert
        expect(response.status).toBe(200)
        const dbUserAfterDeactivation = await engine.storage.models.User.findOne({ _id: user.id })
        expect(dbUserAfterDeactivation).toBeNull()
      })
    })

    describe('User creation v2', () => {
      it('should create a user with email and password', async () => {
        // Act: Create a user
        const response = await testServer
          .post('/v2/users')
          .send({ email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }) })

        // Assert
        expect(response.status).toBe(200);
        // expect(response.status).toBe(201);
        const users = await engine.storage.models.User.find({ _id: response.body.id })
        expect(users).toHaveLength(1)

        expect(users[0].toObject().activated).toBe(true)
      })
    })

    describe('User deletion v2', () => {

      it('should be able to request a user deactivation', async () => {

        // Arrange: Create User
        const payload = { email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }), }
        const { body: user } = await testServer
          .post('/v2/users')
          .send(payload)
          // .expect(201)
          .expect(200);


        // Act: Request Deactivation
        const deactivatorHash = dataGenerator.hash()
        const response = await testServer
          .delete(`/v2/users/request-deactivate?deactivator=${deactivatorHash}&redirect=/`)
          .set('Authorization', getAuth(payload))

        // Assert
        expect(response.status).toBe(200);

        const dbUser = await engine.storage.models.User.findOne({ _id: user.id })
        expect(dbUser).not.toBeNull()

        const token = dbUser.toObject().deactivator
        expect(token).toBe(deactivatorHash)

        expect(sendGridMail.send).toHaveBeenCalled()


      })

      it('should be able to confirm a user deactivation', async () => {

        // Arrange: Create User
        const payload = { email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }), }
        const { body: user } = await testServer
          .post('/v2/users')
          .send(payload)
          // .expect(201)
          .expect(200);


        // Arrange: Request Deactivation
        const token = dataGenerator.hash()
        await testServer
          .delete(`/v2/users/request-deactivate?deactivator=${token}&redirect=/`)
          .set('Authorization', getAuth(payload))
          .expect(200)


        // Act: Confirm Deactivation
        const response = await testServer.delete(`/v2/users/confirm-deactivate/${token}`)

        // Assert
        expect(response.status).toBe(200);
        const dbUserAfterDeactivation = await engine.storage.models.User.findOne({ _id: user.id })
        expect(dbUserAfterDeactivation).toBeNull()

      })

    })

    describe('User update v2', () => {

      it('should be able to update a user email via gateway', async () => {

        // Arrange: Create User
        const payload = { email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }), }
        const { body: user } = await testServer
          .post('/v2/users')
          .send(payload)
          // .expect(201)
          .expect(200);


        // Act: Update User Email
        const newEmail = dataGenerator.email()
        const response = await testServer
          .patch(`/v2/gateway/users/${user.id}`)
          .set('Authorization', `Bearer fake-token`)
          .send({ email: newEmail })


        // Assert
        expect(response.status).toBe(200);

        const dbUser = await engine.storage.models.User.findOne({ _id: user.id })
        expect(dbUser.toObject().email).toBe(newEmail)

      })
    })
  })

})

