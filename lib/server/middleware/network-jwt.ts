import { Request, RequestHandler } from 'express';
import { verify, JwtPayload } from 'jsonwebtoken';
import { ForbiddenError, NotAuthorizedError } from '../error-types';

interface NetworkTokenPayload extends JwtPayload {
  uuid: string;
}

interface UserModel {
  findOne(where: { uuid: string }): Promise<{ activated: boolean } | null>;
}

export function getNetworkJwtSecret(): string | undefined {
  return process.env.inxtbridge_network__JWT_SECRET || undefined;
}

const NETWORK_TOKEN_USERNAME = 'network-token';

export function getNetworkToken(req: Request): string | null {
  const auth = req.headers['authorization'];

  if (!auth || !auth.startsWith('Basic ')) {
    return null;
  }

  const credentials = Buffer.from(auth.slice('Basic '.length), 'base64').toString('utf8');
  const separatorIndex = credentials.indexOf(':');

  if (separatorIndex === -1 || credentials.slice(0, separatorIndex) !== NETWORK_TOKEN_USERNAME) {
    return null;
  }

  return credentials.slice(separatorIndex + 1) || null;
}

export function buildNetworkJwtMiddleware(User: UserModel, secret: string | undefined): RequestHandler {
  return async (req, _, next) => {
    const token = getNetworkToken(req);

    if (!secret || !token) {
      return next(NotAuthorizedError('Invalid network token'));
    }

    let payload: NetworkTokenPayload;
    try {
      payload = verify(token, secret, { algorithms: ['HS256'] }) as NetworkTokenPayload;
    } catch {
      return next(NotAuthorizedError('Invalid network token'));
    }

    if (!payload.uuid) {
      return next(NotAuthorizedError('Invalid network token'));
    }

    try {
      const user = await User.findOne({ uuid: payload.uuid });

      if (!user) {
        return next(NotAuthorizedError('User not found'));
      }

      if (!user.activated) {
        return next(ForbiddenError('User account has not been activated'));
      }

      (req as any).user = user;
      (req as any).networkJwt = payload;
      next();
    } catch (err) {
      next(err);
    }
  };
}
