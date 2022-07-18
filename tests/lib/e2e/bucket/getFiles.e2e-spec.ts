import { uploadRandomFile } from './setup';
import { waitForBridgeToBeUp } from '../setup';
import {
  api,
  AuthorizationHeader,
  registerSampleUserAndGetBucketId,
} from '../setup';

let bucketId: string;
let GET_FILES_PATH: string;

export const getFilesEndpoint = (bucketId: string) =>
  `/buckets/${bucketId}/bulk-files`;

let fileIds: string[] = [];

const longTimeout = 50_000;

describe('Finish Upload v2', () => {
  beforeAll(async () => {
    await waitForBridgeToBeUp();
    bucketId = await registerSampleUserAndGetBucketId();
    GET_FILES_PATH = getFilesEndpoint(bucketId);

    const uploadFileResponse = await uploadRandomFile(bucketId);
    fileIds.push(uploadFileResponse.body.id);
  }, longTimeout);

  describe('Validation Get Files', () => {
    it('No fileids', async () => {
      const response = await api.get(GET_FILES_PATH).set(AuthorizationHeader);
      expect(response.status).toBe(400);
    });

    it('Invalid fileid - not a mongoId', async () => {
      const response = await api
        .get(`${GET_FILES_PATH}?fileIds=324342jfdf2`)
        .set(AuthorizationHeader);
      expect(response.status).toBe(500);
    });

    it('Returns null for non existing file ids', async () => {
      const response = await api
        .get(`${GET_FILES_PATH}?fileIds=72b814bf3cde6dcc6f6c9a7b`)
        .set(AuthorizationHeader);
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      // Do we want to return null for non existent file ids?
      expect(response.body[0]).toBeNull();
    });
  });

  describe('Functionality', () => {
    it('One valid FileId other non existing', async () => {
      const response = await api
        .get(`${GET_FILES_PATH}?fileIds=${fileIds[0]},72b814bf3cde6dcc6f6c9a7b`)
        .set(AuthorizationHeader);
      expect(response.status).toBe(200);
      expect(response.body[0].fileId).toBe(fileIds[0]);
      expect(response.body[1]).toBeNull();
    });

    it('Gets the correct url', async () => {
      const response = await api
        .get(`${GET_FILES_PATH}?fileIds=${fileIds[0]}`)
        .set(AuthorizationHeader);
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].link).toContain('http');
      expect(response.body[0].fileId).toBe(fileIds[0]);
    });

    it('Works with two files', async () => {
      const uploadFileResponse = await uploadRandomFile(bucketId);

      fileIds.push(uploadFileResponse.body.id);
      const response = await api
        .get(`${GET_FILES_PATH}?fileIds=${fileIds.join(',')}`)
        .set(AuthorizationHeader);
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      for (const [i, file] of response.body.entries()) {
        expect(file.link).toContain('http');
        expect(file.fileId).toBe(fileIds[i]);
        expect(file.index).toBeDefined();
      }
    });
  });
});
