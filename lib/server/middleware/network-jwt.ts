import { verify, JwtPayload } from 'jsonwebtoken';
import { validate as uuidValidate } from 'uuid';

const NETWORK_TOKEN_USERNAME = 'network-token';

export const NETWORK_TOKEN_AUDIENCE = 'bridge-network';

export function isNetworkTokenUsername(username?: string): boolean {
  return username === NETWORK_TOKEN_USERNAME;
}

interface NetworkTokenClaims {
  uuid: string;
  bucket: string;
}

/**
 * Returns the user and the bucket the token was issued for, or null when the token is not valid
 */
export function verifyNetworkToken(token: string | undefined, secret: string | undefined): NetworkTokenClaims | null {
  if (!token || !secret) {
    return null;
  }

  try {
    const { uuid, bucket } = verify(token, secret, {
      algorithms: ['HS256'],
      audience: NETWORK_TOKEN_AUDIENCE,
      clockTolerance: 60,
      maxAge: '2h',
    }) as JwtPayload;

    const isValid = typeof uuid === 'string' && uuidValidate(uuid) && typeof bucket === 'string' && bucket.length > 0;

    return isValid ? { uuid, bucket } : null;
  } catch {
    return null;
  }
}
