import { createTestUser, getAuth, shutdownEngine, signRS256JWT, } from '../utils'
import { engine, testServer } from '../setup'
import { User } from '../../../../lib/core/users/User';
import { StorageDbManager } from '../storage-db-manager'
import crypto from 'crypto';
import sinon from 'sinon';
import axios from 'axios';
import { StorageGateway } from '../../../../lib/core/storage/StorageGateway';

const MB100 = 100 * 1024 * 1024;

describe('Gateway V2 e2e tests', () => {
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
            const testUser = await createTestUser()
            const newMaxSpaceBytes = 100000;

            const jwt = signRS256JWT(
                '5m',
                engine._config.gateway.SIGN_JWT_SECRET,
            );

            const response = await testServer
                .put(`/v2/gateway/storage/users/${testUser.uuid}`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ bytes: newMaxSpaceBytes })


            expect(response.status).toBe(200)
            const updatedUser = await databaseConnection.models.User.findOne({ uuid: testUser.uuid })
            expect(testUser.maxSpaceBytes).not.toEqual(updatedUser.maxSpaceBytes)
            expect(updatedUser.maxSpaceBytes).toEqual(newMaxSpaceBytes)
        })
    })

    describe('Creating a user bucket', () => {
        it('When creating a bucket for a user, then it is persisted with the user uuid and given name', async () => {
            const testUser = await createTestUser()
            const bucketName = `mail-account-${crypto.randomUUID()}`

            const jwt = signRS256JWT('5m', engine._config.gateway.SIGN_JWT_SECRET)

            const response = await testServer
                .post(`/v2/gateway/users/${testUser.uuid}/buckets`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ name: bucketName })

            expect(response.status).toBe(200)
            expect(response.body.name).toBe(bucketName)
            expect(response.body.id).toBeDefined()

            const bucketInDatabase = await databaseConnection.models.Bucket.findOne({ _id: response.body.id })
            expect(bucketInDatabase).not.toBeNull()
            expect(bucketInDatabase.userId).toBe(testUser.uuid)
            expect(bucketInDatabase.name).toBe(bucketName)
        })

        it('When creating a bucket with a name that already exists, then it returns the existing bucket', async () => {
            const testUser = await createTestUser()
            const bucketName = `mail-account-${crypto.randomUUID()}`

            const jwt = signRS256JWT('5m', engine._config.gateway.SIGN_JWT_SECRET)

            const firstResponse = await testServer
                .post(`/v2/gateway/users/${testUser.uuid}/buckets`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ name: bucketName })

            const secondResponse = await testServer
                .post(`/v2/gateway/users/${testUser.uuid}/buckets`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ name: bucketName })

            expect(firstResponse.status).toBe(200)
            expect(secondResponse.status).toBe(200)
            expect(secondResponse.body.id).toBe(firstResponse.body.id)

            const buckets = await databaseConnection.models.Bucket.find({ userId: testUser.uuid, name: bucketName })
            expect(buckets.length).toBe(1)
        })

        it('When creating a bucket without a name, then it returns 400', async () => {
            const testUser = await createTestUser()

            const jwt = signRS256JWT('5m', engine._config.gateway.SIGN_JWT_SECRET)

            const response = await testServer
                .post(`/v2/gateway/users/${testUser.uuid}/buckets`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({})

            expect(response.status).toBe(400)
        })

        it('When creating a bucket for an unknown user, then it returns 404', async () => {
            const jwt = signRS256JWT('5m', engine._config.gateway.SIGN_JWT_SECRET)

            const response = await testServer
                .post(`/v2/gateway/users/${crypto.randomUUID()}/buckets`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ name: 'mail-account' })

            expect(response.status).toBe(404)
        })
    })

    describe('Bucket entries', () => {
        const createBucketForUser = async (userUuid: string, jwt: string) => {
            const { body } = await testServer
                .post(`/v2/gateway/users/${userUuid}/buckets`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ name: `mail-account-${crypto.randomUUID()}` })

            return body as { id: string; name: string }
        }

        const hashKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex')

        it('When creating an entry, then it is persisted with the hashed key and the user total grows by its size', async () => {
            const testUser = await createTestUser()
            const jwt = signRS256JWT('5m', engine._config.gateway.SIGN_JWT_SECRET)
            const bucket = await createBucketForUser(testUser.uuid, jwt)
            const key = `1:${Date.now()}`

            const userBefore = await databaseConnection.models.User.findOne({ uuid: testUser.uuid })

            const response = await testServer
                .post(`/v2/gateway/users/${testUser.uuid}/buckets/${bucket.id}/entries`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ key, size: 5000 })

            expect(response.status).toBe(200)
            expect(response.body.id).toBeDefined()

            const entryInDatabase = await databaseConnection.models.BucketEntry.findOne({ _id: response.body.id })
            expect(entryInDatabase).not.toBeNull()
            expect(entryInDatabase.index).toBe(hashKey(key))
            expect(entryInDatabase.name).toBe(key)
            expect(entryInDatabase.size).toBe(5000)
            expect(entryInDatabase.version).toBe(2)

            const userAfter = await databaseConnection.models.User.findOne({ uuid: testUser.uuid })
            expect(userAfter.totalUsedSpaceBytes).toBe(userBefore.totalUsedSpaceBytes + 5000)
            expect(response.body.maxSpaceBytes).toBe(userAfter.maxSpaceBytes)
            expect(response.body.totalUsedSpaceBytes).toBe(userAfter.totalUsedSpaceBytes)
        })

        it('When creating the same entry twice, then it is counted only once', async () => {
            const testUser = await createTestUser()
            const jwt = signRS256JWT('5m', engine._config.gateway.SIGN_JWT_SECRET)
            const bucket = await createBucketForUser(testUser.uuid, jwt)
            const key = `1:${Date.now()}`

            const userBefore = await databaseConnection.models.User.findOne({ uuid: testUser.uuid })

            const first = await testServer
                .post(`/v2/gateway/users/${testUser.uuid}/buckets/${bucket.id}/entries`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ key, size: 5000 })

            const second = await testServer
                .post(`/v2/gateway/users/${testUser.uuid}/buckets/${bucket.id}/entries`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ key, size: 5000 })

            expect(first.status).toBe(200)
            expect(second.status).toBe(200)
            expect(second.body.id).toBe(first.body.id)
            expect(second.body.totalUsedSpaceBytes).toBe(first.body.totalUsedSpaceBytes)

            const entries = await databaseConnection.models.BucketEntry.find({ bucket: bucket.id })
            expect(entries.length).toBe(1)

            const userAfter = await databaseConnection.models.User.findOne({ uuid: testUser.uuid })
            expect(userAfter.totalUsedSpaceBytes).toBe(userBefore.totalUsedSpaceBytes + 5000)
        })

        it('When deleting an entry, then it is removed and the user total shrinks by its size', async () => {
            const testUser = await createTestUser()
            const jwt = signRS256JWT('5m', engine._config.gateway.SIGN_JWT_SECRET)
            const bucket = await createBucketForUser(testUser.uuid, jwt)
            const key = `1:${Date.now()}`

            const created = await testServer
                .post(`/v2/gateway/users/${testUser.uuid}/buckets/${bucket.id}/entries`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ key, size: 5000 })

            const userBefore = await databaseConnection.models.User.findOne({ uuid: testUser.uuid })

            const response = await testServer
                .delete(`/v2/gateway/users/${testUser.uuid}/buckets/${bucket.id}/entries/${encodeURIComponent(key)}`)
                .set('Authorization', `Bearer ${jwt}`)

            expect(response.status).toBe(200)

            const entryInDatabase = await databaseConnection.models.BucketEntry.findOne({ _id: created.body.id })
            expect(entryInDatabase).toBeNull()

            const userAfter = await databaseConnection.models.User.findOne({ uuid: testUser.uuid })
            expect(userAfter.totalUsedSpaceBytes).toBe(userBefore.totalUsedSpaceBytes - 5000)
            expect(response.body).toEqual({
                maxSpaceBytes: userAfter.maxSpaceBytes,
                totalUsedSpaceBytes: userAfter.totalUsedSpaceBytes,
            })
        })

        it('When deleting an entry that does not exist, then it is a no-op and the user total is unchanged', async () => {
            const testUser = await createTestUser()
            const jwt = signRS256JWT('5m', engine._config.gateway.SIGN_JWT_SECRET)
            const bucket = await createBucketForUser(testUser.uuid, jwt)

            const userBefore = await databaseConnection.models.User.findOne({ uuid: testUser.uuid })

            const response = await testServer
                .delete(`/v2/gateway/users/${testUser.uuid}/buckets/${bucket.id}/entries/${encodeURIComponent('1:404')}`)
                .set('Authorization', `Bearer ${jwt}`)

            expect(response.status).toBe(200)

            const userAfter = await databaseConnection.models.User.findOne({ uuid: testUser.uuid })
            expect(userAfter.totalUsedSpaceBytes).toBe(userBefore.totalUsedSpaceBytes)
        })

        it('When creating an entry on a bucket of another user, then it returns 404 and changes nothing', async () => {
            const owner = await createTestUser()
            const otherUser = await createTestUser()
            const jwt = signRS256JWT('5m', engine._config.gateway.SIGN_JWT_SECRET)
            const bucket = await createBucketForUser(owner.uuid, jwt)

            const response = await testServer
                .post(`/v2/gateway/users/${otherUser.uuid}/buckets/${bucket.id}/entries`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ key: '1:1', size: 5000 })

            expect(response.status).toBe(404)

            const entries = await databaseConnection.models.BucketEntry.find({ bucket: bucket.id })
            expect(entries.length).toBe(0)
        })

        it('When the entry key or size is invalid, then it returns 400', async () => {
            const testUser = await createTestUser()
            const jwt = signRS256JWT('5m', engine._config.gateway.SIGN_JWT_SECRET)
            const bucket = await createBucketForUser(testUser.uuid, jwt)

            const missingKey = await testServer
                .post(`/v2/gateway/users/${testUser.uuid}/buckets/${bucket.id}/entries`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ size: 5000 })

            const negativeSize = await testServer
                .post(`/v2/gateway/users/${testUser.uuid}/buckets/${bucket.id}/entries`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ key: '1:1', size: -1 })

            const nonIntegerSize = await testServer
                .post(`/v2/gateway/users/${testUser.uuid}/buckets/${bucket.id}/entries`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ key: '1:1', size: 10.5 })

            expect(missingKey.status).toBe(400)
            expect(negativeSize.status).toBe(400)
            expect(nonIntegerSize.status).toBe(400)
        })

        it('When no auth token is provided, then it returns 401', async () => {
            const testUser = await createTestUser()

            const response = await testServer
                .post(`/v2/gateway/users/${testUser.uuid}/buckets/${'a'.repeat(24)}/entries`)
                .send({ key: '1:1', size: 1000 })

            expect(response.status).toBe(401)
        })
    })

    describe('Deleting user files', () => {
        let axiosGetStub: sinon.SinonStub
        const FAKE_UPLOAD_URL = 'http://fake-upload-url'
        const FAKE_DOWNLOAD_URL = 'http://fake-download-url'

        beforeEach(async () => {
            await databaseConnection.connect();
            jest.clearAllMocks()
            const nodeIDs = Object.values(engine._config.application.CLUSTER)
            await Promise.all(
                nodeIDs.map((nodeID, index) => {
                    const payload = { nodeID, protocol: "1.2.0-INXT", address: `72.132.43.${index}`, port: 43758 + index, lastSeen: new Date(), }
                    return new Promise(resolve => engine.storage.models.Contact.record(payload, resolve))
                })
            )
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
                if (url.includes('/v2/download/link')) return { data: { result: FAKE_DOWNLOAD_URL } }
                if (url.includes('exists')) return { status: 200 }
            })
        })

        it('When sending multiple files in bulk, then they should be deleted', async () => {
            const usersAndFiles = await createUsersAndFiles(2, 5);
            const createdFileIds = usersAndFiles.map(f => f.fileId);
            const jwt = signRS256JWT(
                '5m',
                engine._config.gateway.SIGN_JWT_SECRET,
            );

            const response = await testServer
                .delete(`/v2/gateway/storage/files/`)
                .set('Authorization', `Bearer ${jwt}`)
                .send({ files: createdFileIds })

            expect(response.status).toBe(200)
            const confirmedFileIds = response.body.message.confirmed;
            expect(confirmedFileIds).toEqual(expect.arrayContaining(createdFileIds));
            const filesInDatabase = await databaseConnection.models.BucketEntry.find({ _id: { $in: createdFileIds } })
            expect(filesInDatabase.length).toEqual(0);
        })
    })
})


const createUsersAndFiles = async (totalUsers = 1, totalFilesPerUser = 1) => {
    const results: { fileId: string; size: number, user: User }[] = [];

    for (let userIndex = 0; userIndex < totalUsers; userIndex++) {
        const user = await createTestUser();

        const { body: { id: bucketId } } = await testServer
            .post('/buckets')
            .set('Authorization', getAuth(user));

        for (let fileIndex = 0; fileIndex < totalFilesPerUser; fileIndex++) {
            const { body: { uploads } } = await testServer
                .post(`/v2/buckets/${bucketId}/files/start`)
                .set('Authorization', getAuth(user))
                .send({
                    uploads: [
                        { index: 0, size: MB100 / 2 },
                        { index: 1, size: MB100 / 2 }
                    ]
                });

            const index = crypto.randomBytes(32).toString('hex');

            const getMetaMock = jest.spyOn(StorageGateway, 'getMeta').mockResolvedValue({ size: MB100 / 2 })
            const { body: file } = await testServer
                .post(`/v2/buckets/${bucketId}/files/finish`)
                .set('Authorization', getAuth(user))
                .send({
                    index,
                    shards: (uploads as any[]).map((upload) => ({ hash: crypto.randomBytes(20).toString('hex'), uuid: upload.uuid, })),
                });
            getMetaMock.mockRestore()

            results.push({
                fileId: file.id,
                size: MB100,
                user
            });
        }
    }

    return results;
};
