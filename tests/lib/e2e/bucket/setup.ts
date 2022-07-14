import crypto from 'crypto';
import { finishesCorrectly } from './finishUpload.e2e-spec';
import { startsCorrectly } from './startUpload.e2e-spec.test';
import axios from 'axios';

export const uploadRandomFile = async (bucketId: string) => {
  const {
    body: { uploads },
  } = await startsCorrectly(bucketId, {
    uploads: [
      {
        index: 0,
        size: 1000,
      },
      {
        index: 1,
        size: 30000,
      },
    ],
  });

  for (const upload of uploads) {
    const { url } = upload;
    const file = crypto.randomBytes(50).toString('hex');
    await axios.put(url, file, {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });
  }

  const index = crypto.randomBytes(32).toString('hex');
  return finishesCorrectly(bucketId, {
    index,
    shards: [
      {
        hash: crypto.randomBytes(20).toString('hex'),
        uuid: uploads[0].uuid,
      },
      {
        hash: crypto.randomBytes(20).toString('hex'),
        uuid: uploads[1].uuid,
      },
    ],
  });
};
