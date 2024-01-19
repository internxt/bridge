import { Chance } from 'chance'

export type { User } from '../../../lib/core/users/User';

export type TestUser = { email: string, password: string, maxSpaceBytes: number }

export const dataGenerator = new Chance()

export const testUser: TestUser = {
  password: dataGenerator.hash({ length: 64 }),
  email: dataGenerator.email(),
  maxSpaceBytes: 2147483648
}


