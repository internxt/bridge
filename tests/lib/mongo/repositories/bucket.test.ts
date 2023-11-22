// import { config } from 'dotenv';
// import { MongoDBBucketsRepository } from '../../../../lib/core/buckets/MongoDBBucketsRepository';
// import { bucketsFixtures } from '../fixtures/buckets.fixtures';
// import { unloadLoadFixtures } from '../fixtures/init-fixtures';
// import { setupAndValidateStorageForFixtures } from './utils';

// config();

// const { storage, uri, BRIDGE_TEST_DB_NAME } =
//   setupAndValidateStorageForFixtures();

// let repository: MongoDBBucketsRepository = new MongoDBBucketsRepository(
//   storage.models.Bucket
// );

// const [bucket1, bucket2] = bucketsFixtures;

// beforeEach((ready) => {
//   console.log(uri, BRIDGE_TEST_DB_NAME);
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

// describe('Buckets repository', () => {
//   describe('findOne', () => {
//     it('findOne()', async () => {
//       const bucket = await repository.findOne({
//         user: bucket2.user,
//         name: bucket2.name,
//       });

//       expect(bucket).not.toBeNull();
//       expect(bucket).toStrictEqual(bucket2);
//     });

//     it('findOne() - not found', async () => {
//       const bucket = await repository.findOne({
//         user: 'doesntexist@user.com',
//         name: 'Bucket-914bfb',
//       });

//       expect(bucket).toBeNull();
//     });
//   });

//   it('findByIds()', async () => {
//     const buckets = await repository.findByIds([bucket1.id, bucket2.id]);

//     expect(buckets).toHaveLength(2);
//     expect(buckets[0]).toStrictEqual(bucket1);
//     expect(buckets[1]).toStrictEqual(bucket2);
//   });

//   it('find()', async () => {
//     const buckets = await repository.find({
//       user: bucket2.user,
//     });

//     expect(buckets).toHaveLength(2);
//   });

//   it('removeAll()', async () => {
//     await repository.removeAll({});
//     expect(repository.find({})).resolves.toHaveLength(0);
//   });

//   it('removeAll() with filter', async () => {
//     // WILL NOT WORK WITH ID:
//     await repository.removeAll({ name: bucket1.name });
//     expect(repository.find({})).resolves.toHaveLength(1);
//   });
// });
