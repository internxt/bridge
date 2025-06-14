import { createTestUser, getAuth, shutdownEngine, signRS256JWT, } from '../utils'
import { engine, testServer } from '../setup'
import { User } from '../../../../lib/core/users/User';
import { StorageDbManager } from '../storage-db-manager'
import crypto from 'crypto';
import sinon from 'sinon';
import axios from 'axios';

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
            const filesInDatabase = await databaseConnection.models.BucketEntry.find({ id: { $in: createdFileIds } })
            expect(filesInDatabase.length).toEqual(0);
        })
    })
})


const createUsersAndFiles = async (totalUsers = 1, totalFilesPerUser = 1) => {
    const results: { fileId: string; size: number, user: User }[] = [];
    const MB100 = 100 * 1024 * 1024;

    for (let userIndex = 0; userIndex < totalUsers; userIndex++) {
        const user = await createTestUser();

        // Create a bucket for this user
        const { body: { id: bucketId } } = await testServer
            .post('/buckets')
            .set('Authorization', getAuth(user));

        // Create multiple files for this user
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
            const { body: file } = await testServer
                .post(`/v2/buckets/${bucketId}/files/finish`)
                .set('Authorization', getAuth(user))
                .send({
                    index,
                    shards: (uploads as any[]).map((upload) => ({ hash: crypto.randomBytes(20).toString('hex'), uuid: upload.uuid, })),
                });

            results.push({
                fileId: file.id,
                size: MB100,
                user
            });
        }
    }

    return results;
};

