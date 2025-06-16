import { Chance } from 'chance'

export type { User } from '../../../lib/core/users/User';

export type TestUser = { email: string, password: string, maxSpaceBytes: number }

export const dataGenerator = new Chance()

export const generateTestUserData = (args?: Partial<TestUser>): TestUser => {
  return {
    email: args?.email ?? dataGenerator.email(),
    password: args?.password ?? dataGenerator.hash({ length: 64 }),
    maxSpaceBytes: args?.maxSpaceBytes ?? 2147483648
  }
}


