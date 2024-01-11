import { engine, intervalRefs } from './setup';
import { TestUser, testUser, User } from './users.fixtures'

type Args = { storage?: any, user?: TestUser }

const createdUsers: User[] = []
export const createTestUser = async (args: Args = {}): Promise<User> => {
  const { storage = engine.storage, user = testUser } = args

  const payload = { email: user.email, password: user.password }
  const createdUser: User = await new Promise((resolve, reject) => storage.models.User.create(payload, (err: Error, user: any) => {
    err ? reject(err) : resolve(user.toObject())
  }))

  await storage.models.User.updateOne(
    { _id: createdUser.uuid, },
    { maxSpaceBytes: user.maxSpaceBytes, activated: true, }
  );

  createdUser.password = user.password

  createdUsers.push(createdUser)

  return createdUser
}

export const cleanUpTestUsers = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    engine.storage.models.User.deleteMany({ email: { $in: [createdUsers.map(user => user.email)] } }, (err: Error) => {
      err ? reject(err) : resolve()
    })
  })

}

export const deleteTestUser = (args: Args = {}): Promise<void> => {
  const { storage = engine.storage, user = testUser } = args
  return new Promise((resolve, reject) => storage.models.User.deleteOne({ email: user.email, }, (err: Error) => {
    err ? reject(err) : resolve()
  }))
}

export const getAuth = (user: Omit<TestUser, 'maxSpaceBytes'> = testUser) => {
  const credential = Buffer.from(`${user.email}:${user.password}`).toString('base64');
  return `Basic ${credential}`;
}


export const shutdownEngine = async () => {

  await Promise.all([
    engine.storage.connection.close(),
    engine.networkQueue.close(),
    engine.redis.quit(),
    engine.server.server.close(),
  ])
  intervalRefs.forEach(ref => clearInterval(ref))

}