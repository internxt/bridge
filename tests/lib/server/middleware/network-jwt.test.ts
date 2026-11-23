import { Request, Response } from 'express';
import { sign } from 'jsonwebtoken';

import { buildNetworkJwtMiddleware, getNetworkToken } from '../../../../lib/server/middleware/network-jwt';

const basicAuth = (username: string, password: string) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

describe('Network JWT middleware', () => {
  const secret = 'network-secret';
  const bucketId = 'bucket-id';
  const userUuid = 'user-uuid';
  const user = { uuid: userUuid, activated: true };

  const buildToken = (payload: object = {}, options: object = {}, key: string = secret) =>
    sign({ uuid: userUuid, ...payload }, key, {
      algorithm: 'HS256',
      expiresIn: 60,
      ...options,
    });

  const run = async (token: string, { foundUser = user as unknown, key = secret as string | null } = {}) => {
    const User = { findOne: jest.fn().mockResolvedValue(foundUser) };
    const req = { headers: { authorization: basicAuth('network-token', token) }, params: { id: bucketId } } as unknown as Request;
    const next = jest.fn();

    await buildNetworkJwtMiddleware(User, key ?? undefined)(req, {} as Response, next);

    return { req: req as Request & { user?: unknown }, next, User };
  };

  it('When the token is valid, then the request is authenticated as the token user', async () => {
    const { req, next, User } = await run(buildToken());

    expect(User.findOne).toHaveBeenCalledWith({ uuid: userUuid });
    expect(req.user).toBe(user);
    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ['has expired', () => buildToken({}, { expiresIn: -10 })],
    ['has no user', () => buildToken({ uuid: undefined })],
    ['is signed with another secret', () => buildToken({}, {}, 'another-secret')],
  ])('When the token %s, then it is not authorized', async (_, buildInvalidToken) => {
    const { next, User } = await run(buildInvalidToken());

    expect(User.findOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }));
  });

  it('When no secret is configured, then network tokens are not accepted', async () => {
    const { next } = await run(buildToken(), { key: null });

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }));
  });

  it('When the token user does not exist, then it is not authorized', async () => {
    const { next } = await run(buildToken(), { foundUser: null });

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }));
  });

  it('When the token user is not activated, then it is forbidden', async () => {
    const { next } = await run(buildToken(), { foundUser: { activated: false } });

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 403 }));
  });

  describe('Network token extraction', () => {
    const requestWith = (authorization?: string) => ({ headers: { authorization } }) as unknown as Request;

    it('When basic auth uses the network token username, then the password is the token', () => {
      expect(getNetworkToken(requestWith(basicAuth('network-token', 'a.b.c')))).toBe('a.b.c');
    });

    it.each([
      ['regular basic credentials', basicAuth('user@internxt.com', 'hashed-pass')],
      ['an empty token', basicAuth('network-token', '')],
      ['a bearer token', 'Bearer a.b.c'],
      ['no authorization', undefined],
    ])('When the request has %s, then there is no network token', (_, authorization) => {
      expect(getNetworkToken(requestWith(authorization))).toBeNull();
    });
  });
});
