// import { config } from 'dotenv';
// import { MongoDBUploadsRepository } from '../../../../lib/core/uploads/MongoDBUploadsRepository';
// import { uploadFixtures } from '../fixtures/uploads.fixtures';
// import { unloadLoadFixtures } from '../fixtures/init-fixtures';
// import { setupAndValidateStorageForFixtures } from './utils';

// config();

// const { storage, uri, BRIDGE_TEST_DB_NAME } =
//   setupAndValidateStorageForFixtures();

// let repository: MongoDBUploadsRepository = new MongoDBUploadsRepository(
//   storage.models.Upload
// );

// const [upload1, upload2] = uploadFixtures;

// beforeEach((ready) => {
//   unloadLoadFixtures(uri, BRIDGE_TEST_DB_NAME).then(() => {
//     ready();
//   });
// });

// afterAll((finish) => {
//   unloadLoadFixtures(uri, BRIDGE_TEST_DB_NAME)
//     .then(async () => {
//       await storage.connection.close();
//       finish();
//     })
//     .catch(finish);
// });

// describe('Uploads repository', () => {
//   describe('findByUuids', () => {
//     it('findByUuids()', async () => {
//       const uploads = await repository.findByUuids([
//         upload1.uuid,
//         upload2.uuid,
//       ]);

//       expect(uploads).toEqual(expect.arrayContaining([upload1, upload2]));
//     });

//     it('findByUuids() - not found', async () => {
//       const upload = await repository.findByUuids(['non-existing-uuid']);

//       expect(upload).toHaveLength(0);
//     });
//   });

//   it('deleteManyByUuids()', async () => {
//     await repository.deleteManyByUuids([upload1.uuid, upload2.uuid]);
//     expect(
//       repository.findByUuids([upload1.uuid, upload2.uuid])
//     ).resolves.toHaveLength(0);
//   });
// });
