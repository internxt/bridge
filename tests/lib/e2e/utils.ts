import { engine, intervalRefs } from './setup';
import { TestUser, testUser, User } from './users.fixtures'

type Args = { storage?: any, user?: TestUser }

export const createTestUser = async (args: Args = {}): Promise<User> => {
  const { storage = engine.storage, user = testUser } = args

  const payload = { email: user.email, password: user.password }
  const createdUser: User = await new Promise(resolve => storage.models.User.create(payload, (err: Error, user: any) => {
    if (err) throw err
    resolve(user.toObject())
  }))

  await storage.models.User.updateOne(
    { _id: createdUser.uuid, },
    { maxSpaceBytes: user.maxSpaceBytes, activated: true, }
  );

  createdUser.password = user.password

  return createdUser
}

export const deleteTestUser = async (args: Args = { }): Promise<void> => {
  const { storage = engine.storage, user = testUser } = args
  return await new Promise(resolve => storage.models.User.deleteOne({
    email: user.email,
  }, (err: Error) => {
    if (err) throw err
    resolve()
  }))

}

export const getAuth = (user: Omit<TestUser, 'maxSpaceBytes'> = testUser) => {
  const credential = Buffer.from(`${user.email}:${user.password}`).toString('base64');
  return `Basic ${credential}`;
}


export const shutdownEngine = async (engine: any) => {

  await Promise.all([
    engine.storage.connection.close(),
    engine.networkQueue.close(),
    engine.redis.quit(),
    engine.server.server.close(),
  ])
  intervalRefs.forEach(ref => clearInterval(ref))

}