interface Env {
  gateway: {
    jwtSecret: string;
  }
}

export function getEnv(): Env {
  if (!process.env.inxtbridge_gateway__JWT_SECRET) {
    throw new Error('Missing GATEWAY JWT SECRET');
  }

  return {
    gateway: {
      jwtSecret: process.env.inxtbridge_gateway__JWT_SECRET
    }
  }
}