import { createTestUser, getAuth, shutdownEngine, } from '../utils'

import sendGridMail from '@sendgrid/mail'
import { engine, testServer } from '../setup'
import { dataGenerator, generateTestUserData } from '../users.fixtures'


// Mock SendGrid
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn((_, __, done) => typeof done === 'function' ? done() : Promise.resolve()),
}))

// Mock JWT verification
jest.mock('jsonwebtoken', () => ({ verify: jest.fn((_, __, ___, cb) => cb(null, {})) }))

describe('Bridge E2E Tests', () => {

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterAll(async() => {
    await shutdownEngine()
  })

  describe('Users Management', () => {


    describe('User Management v1', () => {

      describe('Deleting an existing user', () => {

        it('When requesting user deactivation, it should work for authorized user email', async () => {
          // Arrange: Create User
          const payload = generateTestUserData()
          const user = await createTestUser({ user: payload })

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
          const payload1 = generateTestUserData()
          const user = await createTestUser({ user: payload1 })

          const payload2 = generateTestUserData()
          await createTestUser({ user: payload2 })

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
          const payload = generateTestUserData()
          const user = await createTestUser({ user: payload })


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
          const payload = generateTestUserData()
          const user = await createTestUser({ user: payload })


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

      describe('Deleting an existing user', () => {

        it('When requesting user deactivation, it should work for authorized user', async () => {

          // Arrange: Create User
          const payload = generateTestUserData()
          const user = await createTestUser({ user: payload })


          const sendDeleteUserMail = jest.spyOn(engine.mailService, 'sendDeleteUserMail')
          const redirect = 'https://drive.internxt.com/deactivations/token'

          // Act: Request Deactivation
          const deactivatorHash = dataGenerator.hash()
          const response = await testServer
            .delete(`/v2/users/request-deactivate?deactivator=${deactivatorHash}&redirect=${redirect}`)
            .set('Authorization', getAuth(payload))

          // Assert
          expect(response.status).toBe(200);

          const dbUser = await engine.storage.models.User.findOne({ _id: user.id })
          expect(dbUser).not.toBeNull()

          const token = dbUser.toObject().deactivator
          expect(token).toBe(deactivatorHash)

          expect(sendDeleteUserMail).toHaveBeenCalledWith(user.email, redirect)

        })

        it('When requesting user deactivation, then it success', async () => {
          const payload = generateTestUserData()
          const user = await createTestUser({ user: payload })

          const response = await testServer
            .delete(`/v2/users/request-deactivate?deactivator=${dataGenerator.hash()}&redirect=/`)
            .set('Authorization', getAuth(payload))

          expect(response.status).toBe(200)
          expect(response.body).toStrictEqual({ email: user.email, uuid: user.uuid })
        })

        it('When the user has the deactivation disabled, then it fails without sending the email', async () => {
          const payload = generateTestUserData()
          const user = await createTestUser({ user: payload })
          await engine.storage.models.User.collection.updateOne({ _id: user.id }, { $set: { 'configuration.disableDeactivation': true } })
          const sendDeleteUserMail = jest.spyOn(engine.mailService, 'sendDeleteUserMail')

          const response = await testServer
            .delete(`/v2/users/request-deactivate?deactivator=${dataGenerator.hash()}&redirect=/`)
            .set('Authorization', getAuth(payload))

          expect(response.status).toBe(409)
          expect(sendDeleteUserMail).not.toHaveBeenCalled()
          const dbUser = await engine.storage.models.User.findOne({ _id: user.id })
          expect(dbUser.toObject().deactivator).toBeNull()
        })

        it('When sending the email fails, then it fails without saving the deactivator', async () => {
          jest.spyOn(engine.mailService, 'sendDeleteUserMail').mockRejectedValueOnce(new Error('sendgrid down'))
          const payload = generateTestUserData()
          const user = await createTestUser({ user: payload })

          const response = await testServer
            .delete(`/v2/users/request-deactivate?deactivator=${dataGenerator.hash()}&redirect=/`)
            .set('Authorization', getAuth(payload))

          expect(response.status).toBe(500)
          const dbUser = await engine.storage.models.User.findOne({ _id: user.id })
          expect(dbUser.toObject().deactivator).toBeNull()
        })

        it('When confirming user deactivation, it should work with the correct deactivator', async () => {

          // Arrange: Create User
          const payload = generateTestUserData()
          const user = await createTestUser({ user: payload })


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
          const payload = generateTestUserData()
          const user = await createTestUser({ user: payload })


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
          const payload = generateTestUserData()
          const user = await createTestUser({ user: payload })


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

