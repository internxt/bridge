// import { config } from 'dotenv';
// import { MongoDBUsersRepository } from '../../../../lib/core/users/MongoDBUsersRepository';
// import { userFixtures } from '../fixtures/users.fixtures';
// import { unloadLoadFixtures } from '../fixtures/init-fixtures';
// import { setupAndValidateStorageForFixtures } from './utils';
// import { BasicUser } from '../../../../lib/core/users/User';

// config();

// const { storage, uri, BRIDGE_TEST_DB_NAME } =
//   setupAndValidateStorageForFixtures();

// let repository: MongoDBUsersRepository = new MongoDBUsersRepository(
//   storage.models.User
// );

// const [user1] = userFixtures;

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

// describe('User repository', () => {
//   it('findById()', async () => {
//     const user = await repository.findById(user1.id);

//     expect(user).toStrictEqual({ ...user1, email: user1.id });
//   });

//   describe('findOne', () => {
//     it('findOne()', async () => {
//       const expectedBasicUser: BasicUser = {
//         uuid: user1.uuid,
//         id: user1.id,
//         maxSpaceBytes: user1.maxSpaceBytes,
//       };

//       const user = await repository.findOne({
//         uuid: user1.uuid,
//       });

//       expect(user).toStrictEqual({ ...expectedBasicUser });
//     });

//     it('findOne() - not found', async () => {
//       const user = await repository.findOne({
//         uuid: 'non existing uuid',
//       });

//       expect(user).toBeNull();
//     });
//   });

//   it('findByIds()', async () => {
//     const users = await repository.findByIds([user1.id]);

//     expect(users).toHaveLength(1);
//     expect(users[0]).toStrictEqual({ ...user1, email: user1.id });
//   });

//   it('create()', async () => {
//     const created = await repository.create({
//       ...user1,
//       email: 'otheremail@other.com',
//       password:
//         '427e170f76f81f7742e9da100d71346aa631acb3f9980a1a41680883c0654431',
//     });

//     expect(created).not.toBeNull();
//   });

//   it('updateById()', async () => {
//     await repository.updateById(user1.id, { activated: false });
//     const updated = await repository.findById(user1.id);
//     expect(updated).not.toBeNull();
//     expect(updated?.activated).toEqual(false);
//   });

//   it('updateByUuId()', async () => {
//     const result = await repository.updateByUuid(user1.uuid, {
//       activated: true,
//     });
//     const updated = await repository.findById(user1.id);
//     expect(updated).not.toBeNull();
//     expect(updated?.activated).toEqual(true);
//   });

//   it('addTotalUsedSpaceBytes()', async () => {
//     await repository.addTotalUsedSpaceBytes(user1.id, 1000);

//     const updated = await repository.findById(user1.id);
//     expect(updated?.totalUsedSpaceBytes).toEqual(
//       user1.totalUsedSpaceBytes + 1000
//     );
//   });

//   it('removeById()', async () => {
//     await repository.removeById(user1.id);
//     expect(repository.findById(user1.id)).resolves.toBeNull();
//   });
// });
