import { v4 as uuidv4, v3 as uuidv3 } from 'uuid';
import {
  api,
  AuthorizationHeader,
  registerSampleUserAndGetBucketId,
} from '../setup';

let bucketId: string;
let GET_DOWNLOAD_LINKS_PATH: string;
let GET_DOWNLOAD_LINKS_PATH_V2: string;

const fakeFileId = '62c2e18219e09f00511aded9';

describe('Get Download Links', () => {
  beforeAll(async () => {
    bucketId = await registerSampleUserAndGetBucketId();
    GET_DOWNLOAD_LINKS_PATH = `/buckets/${bucketId}/files/${fakeFileId}/info`;
    GET_DOWNLOAD_LINKS_PATH_V2 = `/v2/buckets/${bucketId}/files/${fakeFileId}/mirrors`;
  });

  describe('Get Download links V1 - Validation', () => {
    it('Malformed bucketId', async () => {
      const response = await api
        .get(`/buckets/a_malforned_bucket_id/files/${fakeFileId}/info`)
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Bucket id is malformed');
    });

    it('Malformed fileId', async () => {
      const response = await api
        .get(`/buckets/${bucketId}/files/a_malformed_file_id/info`)
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('File id is malformed');
    });
  });

  describe('Get Download links V2', () => {
    it('Mising bucketId', async () => {
      const response = await api
        .get(`/v2/buckets/a_malfprmed_bucket_id/files/${fakeFileId}/mirrors`)
        .set(AuthorizationHeader);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Bucket id is malformed');
    });
    it('Mising fileId', async () => {
      const response = await api
        .get(`/v2/buckets/${bucketId}/files/a_malformed_file_id/mirrors`)
        .set(AuthorizationHeader);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('File id is malformed');
    });
  });
});
