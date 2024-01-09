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

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Users Management', () => {


    describe('User Management v1', () => {

      describe('Creating a new user', () => {

        it('When creating a user, it should work if email is not in use', async () => {

          // Arrange
          const payload = { email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }), }

          // Act
          const response = await testServer
            .post('/users')
            .send(payload)

          // Assert
          expect(response.status).toBe(201);
          const users = await engine.storage.models.User.find({ _id: response.body.id })
          expect(users).toHaveLength(1)

          expect(users[0].toObject().activated).toBe(true)

          // expect(dispatchSendGridMock).toHaveBeenCalled()

        })
        it('When creating a user, it should fail if email is in use', async () => {

          // Arrange
          const payload = { email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }), }
          await testServer
            .post('/users')
            .send(payload)
            .expect(201);

          // Act
          const response = await testServer
            .post('/users')
            .send(payload)

          // Assert
          expect(response.status).toBe(400);


        })
      })

      describe('Deleting an existing user', () => {

        it('When requesting user deactivation, it should work for authorized user email', async () => {
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

        it('When requesting user deactivation, it should fail for an email different than authorized user email', async () => {

          // Arrange: Create User
          const payload1 = { email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }), }
          const { body: user } = await testServer
            .post('/users')
            .send(payload1)
            .expect(201);

          const payload2 = { email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }), }
          await testServer
            .post('/users')
            .send(payload2)
            .expect(201);

          // Act: Request Deactivation
          const deactivatorHash = dataGenerator.hash()
          const response = await testServer
            .delete(`/users/${payload2.email}?deactivator=${deactivatorHash}&redirect=/`)
            .set('Authorization', getAuth(payload1))

          // Assert
          expect(response.status).toBe(401)
          const dbUser = await engine.storage.models.User.findOne({ _id: user.id })
          expect(dbUser).not.toBeNull()

          const token = dbUser.toObject().deactivator
          expect(token).toBeNull()

        })

        it('When confirming user deactivation, it should work with the correct deactivator', async () => {

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

        it('When confirming user deactivation, it should fail with an incorrect deactivator', async () => {

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
          const response = await testServer.get(`/deactivations/${dataGenerator.hash()}`)

          // Assert
          expect(response.status).toBe(404)
          const dbUserAfterDeactivation = await engine.storage.models.User.findOne({ _id: user.id })
          expect(dbUserAfterDeactivation).not.toBeNull()
        })
      })
    })


    describe('User Management v2', () => {

      describe('Creating a new user', () => {
        it('When creating a user, it should work if email is not in use', async () => {

          // Arrange
          const payload = { email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }), }
          // Act: Create a user
          const response = await testServer
            .post('/v2/users')
            .send(payload)

          // Assert
          expect(response.status).toBe(200);
          // expect(response.status).toBe(201);
          const users = await engine.storage.models.User.find({ _id: response.body.id })
          expect(users).toHaveLength(1)

          expect(users[0].toObject().activated).toBe(true)
        })
        it('When creating a user, it should fail if email is in use', async () => {

          // Arrange
          const payload = { email: dataGenerator.email(), password: dataGenerator.hash({ length: 64 }), }
          await testServer
            .post('/v2/users')
            .send(payload)
            .expect(200);

          // Act: Create a user
          const response = await testServer
            .post('/v2/users')
            .send(payload)

          // Assert
          expect(response.status).toBe(400);
         
        })
      })

      describe('Deleting an existing user', () => {

        it('When requesting user deactivation, it should work for authorized user', async () => {

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

        it('When confirming user deactivation, it should work with the correct deactivator', async () => {

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
        it('When confirming user deactivation, it should fail with an incorrect deactivator', async () => {

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
          const response = await testServer.delete(`/v2/users/confirm-deactivate/${dataGenerator.hash()}`)

          // Assert
          expect(response.status).toBe(404);
          const dbUserAfterDeactivation = await engine.storage.models.User.findOne({ _id: user.id })
          expect(dbUserAfterDeactivation).not.toBeNull()

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

})

