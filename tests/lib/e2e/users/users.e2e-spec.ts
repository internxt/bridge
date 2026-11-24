import { createTestUser, getAuth, shutdownEngine, } from '../utils'

import { engine, testServer } from '../setup'
import { dataGenerator, generateTestUserData } from '../users.fixtures'


// Mock SendGrid
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn((_, __, done) => typeof done === 'function' ? done() : Promise.resolve()),
}))

// Mock JWT verification
jest.mock('jsonwebtoken', () => ({ verify: jest.fn((_, __, ___, cb) => cb(null, {})) }))

const redirect = 'https://drive.internxt.com/deactivations'

const getUser = (id: string) => engine.storage.models.User.findOne({ _id: id })

const setUserFields = (id: string, fields: Record<string, unknown>) =>
  engine.storage.models.User.collection.updateOne({ _id: id } as any, { $set: fields })

const createUserPendingDeactivation = async () => {
  const user = await createTestUser({ user: generateTestUserData() })
  const token = dataGenerator.hash()
  await setUserFields(user.id, { deactivator: token })

  return { user, token }
}

describe('Bridge E2E Tests', () => {

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterAll(async() => {
    await shutdownEngine()
  })

  describe('Users Management', () => {

    describe('Requesting a user deactivation via gateway', () => {

      it('When requesting the deactivation, then it sends the mail with a generated token and saves it', async () => {
        const user = await createTestUser({ user: generateTestUserData() })
        const sendDeleteUserMail = jest.spyOn(engine.mailService, 'sendDeleteUserMail')

        const response = await testServer
          .post(`/v2/gateway/users/${user.uuid}/deactivation`)
          .set('Authorization', 'Bearer fake-token')
          .send({ redirect })

        expect(response.status).toBe(200)
        expect(response.body).toStrictEqual({ email: user.email, uuid: user.uuid })
        const token = (await getUser(user.id)).toObject().deactivator
        expect(token).toMatch(/^[0-9a-f]{512}$/)
        expect(sendDeleteUserMail).toHaveBeenCalledWith(user.email, `${redirect}/${token}`)
      })

      it('When the redirect is missing, then it fails without sending the mail', async () => {
        const user = await createTestUser({ user: generateTestUserData() })
        const sendDeleteUserMail = jest.spyOn(engine.mailService, 'sendDeleteUserMail')

        const response = await testServer
          .post(`/v2/gateway/users/${user.uuid}/deactivation`)
          .set('Authorization', 'Bearer fake-token')
          .send({})

        expect(response.status).toBe(400)
        expect(sendDeleteUserMail).not.toHaveBeenCalled()
      })

      it('When the user does not exist, then it fails', async () => {
        const response = await testServer
          .post(`/v2/gateway/users/${dataGenerator.guid({ version: 4 })}/deactivation`)
          .set('Authorization', 'Bearer fake-token')
          .send({ redirect })

        expect(response.status).toBe(404)
      })

      it('When the user has the deactivation disabled, then it fails without sending the mail', async () => {
        const user = await createTestUser({ user: generateTestUserData() })
        await setUserFields(user.id, { 'configuration.disableDeactivation': true })
        const sendDeleteUserMail = jest.spyOn(engine.mailService, 'sendDeleteUserMail')

        const response = await testServer
          .post(`/v2/gateway/users/${user.uuid}/deactivation`)
          .set('Authorization', 'Bearer fake-token')
          .send({ redirect })

        expect(response.status).toBe(409)
        expect(sendDeleteUserMail).not.toHaveBeenCalled()
        expect((await getUser(user.id)).toObject().deactivator).toBeNull()
      })

      it('When sending the mail fails, then it fails without saving the token', async () => {
        const user = await createTestUser({ user: generateTestUserData() })
        jest.spyOn(engine.mailService, 'sendDeleteUserMail').mockRejectedValueOnce(new Error('sendgrid down'))

        const response = await testServer
          .post(`/v2/gateway/users/${user.uuid}/deactivation`)
          .set('Authorization', 'Bearer fake-token')
          .send({ redirect })

        expect(response.status).toBe(500)
        expect((await getUser(user.id)).toObject().deactivator).toBeNull()
      })

      it.each([
        ['legacy', (email: string) => `/users/${email}?deactivator=${dataGenerator.hash()}&redirect=/`],
        ['v2', () => `/v2/users/request-deactivate?deactivator=${dataGenerator.hash()}&redirect=/`],
      ])('When requesting the deactivation with the user credentials on the %s route, then it is not found', async (_, getPath) => {
        const payload = generateTestUserData()
        const user = await createTestUser({ user: payload })

        const response = await testServer
          .delete(getPath(user.email))
          .set('Authorization', getAuth(payload))

        expect(response.status).toBe(404)
        expect((await getUser(user.id)).toObject().deactivator).toBeNull()
      })
    })

    describe('Confirming a user deactivation', () => {

      it.each([
        ['/deactivations', 'get'],
        ['/v2/users/confirm-deactivate', 'delete'],
      ] as const)('When confirming on %s with the correct token, then the user is deleted', async (path, method) => {
        const { user, token } = await createUserPendingDeactivation()

        const response = await testServer[method](`${path}/${token}`)

        expect(response.status).toBe(200)
        expect(await getUser(user.id)).toBeNull()
      })

      it.each([
        ['/deactivations', 'get'],
        ['/v2/users/confirm-deactivate', 'delete'],
      ] as const)('When confirming on %s with an incorrect token, then it fails and the user is kept', async (path, method) => {
        const { user } = await createUserPendingDeactivation()

        const response = await testServer[method](`${path}/${dataGenerator.hash()}`)

        expect(response.status).toBe(404)
        expect(await getUser(user.id)).not.toBeNull()
      })

      it.each([
        ['/deactivations', 'get'],
        ['/deactivationStripe', 'get'],
        ['/v2/users/confirm-deactivate', 'delete'],
      ] as const)('When confirming on %s and the user has the deactivation disabled, then it fails and the user is kept', async (path, method) => {
        const { user, token } = await createUserPendingDeactivation()
        await setUserFields(user.id, { 'configuration.disableDeactivation': true })

        const response = await testServer[method](`${path}/${token}`)

        expect(response.status).toBe(409)
        expect(await getUser(user.id)).not.toBeNull()
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
