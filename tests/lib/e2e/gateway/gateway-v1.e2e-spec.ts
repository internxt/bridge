import { createTestUser, getAuth, shutdownEngine, } from '../utils'
import { engine, testServer } from '../setup'
import { StorageDbManager } from '../storage-db-manager'

describe('Gateway V1 e2e tests', () => {
    const databaseConnection = new StorageDbManager();

    beforeEach(async () => {
        await databaseConnection.connect();
        jest.clearAllMocks()
    })

    afterAll(async () => {
        await shutdownEngine()
    })

    describe('Updating user storage', () => {

        it('When setting user storage, then it should be persisted in the database', async () => {
            const { username, password } = engine._config.gateway;
            const testUser = await createTestUser()
            const newMaxSpaceBytes = 100000;

            const response = await testServer
                .post('/gateway/upgrade')
                .set('Authorization', getAuth({ email: username, password }))
                .send({ email: testUser.email, bytes: newMaxSpaceBytes })


            expect(response.status).toBe(200)
            const updatedUser = await databaseConnection.models.User.findOne({ uuid: testUser.uuid })
            expect(testUser.maxSpaceBytes).not.toEqual(updatedUser.maxSpaceBytes)
            expect(updatedUser.maxSpaceBytes).toEqual(newMaxSpaceBytes)
        })

        it('When increasing user storage by email, then it should be persisted in the database', async () => {
            const { username, password } = engine._config.gateway;
            const testUser = await createTestUser()
            const bytesToAdd = 1000;

            const response = await testServer
                .put('/gateway/storage')
                .set('Authorization', getAuth({ email: username, password }))
                .send({ email: testUser.email, bytes: bytesToAdd })


            expect(response.status).toBe(200)
            const updatedUser = await databaseConnection.models.User.findOne({ uuid: testUser.uuid })
            expect(updatedUser.maxSpaceBytes).toEqual(testUser.maxSpaceBytes + bytesToAdd)
        })

        it('When increasing user storage by uuid, then it should be persisted in the database', async () => {
            const { username, password } = engine._config.gateway;
            const testUser = await createTestUser()
            const bytesToAdd = 1000;

            const response = await testServer
                .put('/gateway/increment-storage-by-uuid')
                .set('Authorization', getAuth({ email: username, password }))
                .send({ uuid: testUser.uuid, bytes: bytesToAdd })

            console.log(response.body)
            expect(response.status).toBe(200)
            const updatedUser = await databaseConnection.models.User.findOne({ uuid: testUser.uuid })
            expect(updatedUser.maxSpaceBytes).toEqual(testUser.maxSpaceBytes + bytesToAdd)
        })

    })

})

