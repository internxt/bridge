interface Env {
  gateway: {
    jwtSecret: string;
  },
  storage: {
    jwtSecret: string;
  }
}

export function getEnv(): Env {
  if (!process.env.inxtbridge_gateway__JWT_SECRET) {
    throw new Error('Missing GATEWAY JWT SECRET');
  }

  if (!process.env.inxtbridge_storage__JWT_SECRET) {
    throw new Error('Missing STORAGE JWT SECRET');
  }

  return {
    gateway: {
      jwtSecret: process.env.inxtbridge_gateway__JWT_SECRET
    },
    storage: {
      jwtSecret: process.env.inxtbridge_storage__JWT_SECRET
    }
  }
}