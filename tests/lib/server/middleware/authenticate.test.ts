import { Request, Response } from 'express';
import { sign } from 'jsonwebtoken';

import authenticate from '../../../../lib/server/middleware/authenticate';
import { NETWORK_TOKEN_AUDIENCE } from '../../../../lib/server/middleware/network-jwt';

const basicAuth = (username: string, password: string) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

describe('Authenticate middleware with network tokens', () => {
  const networkTokenSecret = 'network-secret';
  const userUuid = '0b1f3c4e-5a6d-4e7f-8a9b-1c2d3e4f5a6b';
  const activatedUser = { uuid: userUuid, activated: true };
  const tokenBucket = '5f8d0d55b54764421b7156c9';

  const buildToken = (key: string = networkTokenSecret) =>
    sign({ uuid: userUuid, bucket: tokenBucket }, key, { algorithm: 'HS256', expiresIn: 60, audience: NETWORK_TOKEN_AUDIENCE });

  const run = async (
    authorization: string,
    {
      foundUser = activatedUser as unknown,
      secret = networkTokenSecret as string | null,
    } = {},
  ) => {
    const User = {
      findOne: jest.fn().mockResolvedValue(foundUser),
      lookup: jest.fn().mockRejectedValue(Object.assign(new Error('Invalid email or password'), { code: 401 })),
    };
    const [, middleware] = authenticate({ User, PublicKey: {}, UserNonce: {} }, { networkTokenSecret: secret ?? undefined });
    const req = { headers: { authorization }, header: () => undefined } as unknown as Request & { user?: unknown; networkToken?: unknown };
    const next = jest.fn();

    await new Promise<void>((resolve) => {
      middleware(req, {} as Response, (err?: unknown) => {
        next(err);
        resolve();
      });
    });

    return { req, next, User };
  };

  it('When the network token is valid, then the request is authenticated as the token user', async () => {
    const { req, next, User } = await run(basicAuth('network-token', buildToken()));

    expect(User.findOne).toHaveBeenCalledWith({ uuid: userUuid });
    expect(User.lookup).not.toHaveBeenCalled();
    expect(req.user).toBe(activatedUser);
    expect(req.networkToken).toStrictEqual({ uuid: userUuid, bucket: tokenBucket });
    expect(next).toHaveBeenCalledWith(undefined);
  });

  it('When the network token is not valid, then it is not authorized', async () => {
    const { next, User } = await run(basicAuth('network-token', buildToken('another-secret')));

    expect(User.findOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }));
  });

  it('When network tokens are not enabled, then it is not authorized', async () => {
    const { next, User } = await run(basicAuth('network-token', buildToken()), { secret: null });

    expect(User.findOne).not.toHaveBeenCalled();
    expect(User.lookup).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }));
  });

  it('When the token user does not exist, then it is not authorized', async () => {
    const { next } = await run(basicAuth('network-token', buildToken()), { foundUser: null });

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }));
  });

  it('When the token user is not activated, then it is forbidden', async () => {
    const { next } = await run(basicAuth('network-token', buildToken()), { foundUser: { activated: false } });

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 403 }));
  });

  it('When regular basic credentials are sent, then they are checked as regular basic auth', async () => {
    const { User } = await run(basicAuth('user@internxt.com', 'hashed-pass'));

    expect(User.findOne).not.toHaveBeenCalled();
    expect(User.lookup).toHaveBeenCalledWith('user@internxt.com', 'hashed-pass');
  });
});
