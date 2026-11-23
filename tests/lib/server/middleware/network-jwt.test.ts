import { sign } from 'jsonwebtoken';

import {
  isNetworkTokenUsername,
  NETWORK_TOKEN_AUDIENCE,
  verifyNetworkToken,
} from '../../../../lib/server/middleware/network-jwt';

describe('Network JWT', () => {
  const secret = 'network-secret';
  const userUuid = '0b1f3c4e-5a6d-4e7f-8a9b-1c2d3e4f5a6b';
  const bucket = '5f8d0d55b54764421b7156c9';

  const buildToken = (payload: object = {}, options: object = {}, key: string = secret) =>
    sign({ uuid: userUuid, bucket, ...payload }, key, {
      algorithm: 'HS256',
      expiresIn: 60,
      audience: NETWORK_TOKEN_AUDIENCE,
      ...options,
    });

  describe('Token verification', () => {
    it('When the token is valid, then it returns the token user and bucket', () => {
      expect(verifyNetworkToken(buildToken(), secret)).toStrictEqual({ uuid: userUuid, bucket });
    });

    it('When the token lives as long as the emitted 90 minutes, then it returns the token user and bucket', () => {
      expect(verifyNetworkToken(buildToken({}, { expiresIn: 90 * 60 }), secret)).toStrictEqual({ uuid: userUuid, bucket });
    });

    it.each([
      ['has expired beyond the clock tolerance', () => buildToken({}, { expiresIn: -120 })],
      ['was issued more than 2 hours ago', () => buildToken({ iat: Math.floor(Date.now() / 1000) - 3 * 60 * 60 }, { expiresIn: 4 * 60 * 60 })],
      ['has no issued at date', () => buildToken({}, { noTimestamp: true })],
      ['has no user', () => buildToken({ uuid: undefined })],
      ['is signed with another secret', () => buildToken({}, {}, 'another-secret')],
      ['has another audience', () => buildToken({}, { audience: 'bridge' })],
      ['has no audience', () => sign({ uuid: userUuid, bucket }, secret, { algorithm: 'HS256', expiresIn: 60 })],
      ['is signed with another algorithm', () => sign({ uuid: userUuid, bucket }, secret, {
        algorithm: 'HS512', expiresIn: 60, audience: NETWORK_TOKEN_AUDIENCE,
      })],
      ['is unsigned', () => sign({ uuid: userUuid, bucket }, '', {
        algorithm: 'none', expiresIn: 60, audience: NETWORK_TOKEN_AUDIENCE,
      })],
      ['has a non uuid user', () => buildToken({ uuid: 'user-uuid' })],
      ['has a query object as user', () => buildToken({ uuid: { $ne: null } })],
      ['has no bucket', () => buildToken({ bucket: undefined })],
      ['is malformed', () => 'not-a-jwt'],
    ])('When the token %s, then it returns null', (_, buildInvalidToken) => {
      expect(verifyNetworkToken(buildInvalidToken(), secret)).toBeNull();
    });

    it('When no secret is configured, then it returns null', () => {
      expect(verifyNetworkToken(buildToken(), undefined)).toBeNull();
    });

    it('When there is no token, then it returns null', () => {
      expect(verifyNetworkToken(undefined, secret)).toBeNull();
    });
  });

  describe('Network token username', () => {
    it('When the username is the network token one, then it is recognized', () => {
      expect(isNetworkTokenUsername('network-token')).toBe(true);
    });

    it.each([
      ['a regular user email', 'user@internxt.com'],
      ['no username', undefined],
    ])('When the username is %s, then it is not recognized', (_, username) => {
      expect(isNetworkTokenUsername(username)).toBe(false);
    });
  });
});
