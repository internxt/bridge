import { type Test, type SuperTest } from 'supertest'
import { MongoUserModel, testUser, } from './users.fixtures'


export * from './users.fixtures'

export const checkConnection = (storage: any) => {
  if (!storage.connection.options.dbName.includes('test')) {
    throw new Error("For caution test database must include test in it's name");
  }
}

export const createTestUser = async (storage: any): Promise<MongoUserModel> => {
  const user: MongoUserModel = await new Promise(resolve => storage.models.User.create({
    email: testUser.email,
    password: testUser.hashpass,
    maxSpaceBytes: testUser.maxSpaceBytes,
    uuid: testUser.uuid,
  }, (err: Error, user: MongoUserModel) => {
    if (err) throw err
    resolve(user)
  }))

  await storage.models.User.updateOne(
    {
      _id: user._id,
    },
    {
      maxSpaceBytes: testUser.maxSpaceBytes,
      activated: testUser.activated,
    }
  );

  return user
}

export const deleteTestUser = async (storage: any): Promise<void> => {
  return await new Promise(resolve => storage.models.User.deleteOne({
    email: testUser.email,
  }, (err: Error) => {
    if (err) throw err
    resolve()
  }))

}


export const getAuth = (user: { email: string, hashpass: string }) => {
  const credential = Buffer.from(`${user.email}:${user.hashpass}`).toString('base64');
  return `Basic ${credential}`;
}
