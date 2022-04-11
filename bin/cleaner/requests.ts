import { createHash } from 'crypto';
import axios from 'axios';

export async function deleteFile(
  bucketId: string,
  fileId: string,
  opts: {
    bridgeEndpoint: string;
    username: string;
    password: string;
  }
): Promise<void> {
  const { bridgeEndpoint, username, password } = opts;
  const pwdHash = createHash('sha256').update(password).digest('hex');
  const credential = Buffer.from(`${username}:${pwdHash}`).toString('base64');

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credential}`,
    },
  };
  return axios.delete(
    `${bridgeEndpoint}/buckets/${bucketId}/files/${fileId}`,
    params
  );
}
