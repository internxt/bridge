import {
  api,
  AuthorizationHeader,
  registerSampleUserAndGetBucketId,
  waitForBridgeToBeUp,
} from '../setup';

export const startUploadEndpoint = (bucketId: string) =>
  `/v2/buckets/${bucketId}/files/start`;

let bucketId: string;
let START_UPLOAD_PATH: string;

export const startsCorrectly = async (
  bucketId: string,
  payload: { uploads: { index: number; size: number }[] },
  multiparts?: number
) => {
  let endpoint = startUploadEndpoint(bucketId);
  if (multiparts) {
    endpoint = `${endpoint}?multiparts=${multiparts}`;
  }
  return api.post(endpoint).send(payload).set(AuthorizationHeader);
};

const longTimeout = 50_000;

describe('Start Upload v2 Validation', () => {
  beforeAll(async () => {
    await waitForBridgeToBeUp();
    bucketId = await registerSampleUserAndGetBucketId();
    START_UPLOAD_PATH = startUploadEndpoint(bucketId);
  }, longTimeout);

  describe('Validation Start Upload (non-multipart)', () => {
    it('Non existing uploads array', async () => {
      const response = await api
        .post(START_UPLOAD_PATH)
        .send({})
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing "uploads" field');
    });

    it('Empty uploads array', async () => {
      const response = await api
        .post(START_UPLOAD_PATH)
        .send({
          uploads: [],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Uploads is empty');
    });

    it('Uploads is not an array', async () => {
      const response = await api
        .post(START_UPLOAD_PATH)
        .send({
          uploads: 'fdsfds',
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Uploads is not an array');
    });

    it('Invalid size', async () => {
      const response = await api
        .post(START_UPLOAD_PATH)
        .send({
          uploads: [
            {
              index: 0,
              size: 'this_should_be_a_number',
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid size');
    });

    it('Missing index', async () => {
      const response = await api
        .post(START_UPLOAD_PATH)
        .send({
          uploads: [
            {
              size: 3234,
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid index');
    });

    it('Missing size', async () => {
      const response = await api
        .post(START_UPLOAD_PATH)
        .send({
          uploads: [
            {
              index: 0,
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid size');
    });

    it('Negative index', async () => {
      const response = await api
        .post(START_UPLOAD_PATH)
        .send({
          uploads: [
            {
              index: -1,
              size: 3234,
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid index');
    });

    it('Negative size', async () => {
      const response = await api
        .post(START_UPLOAD_PATH)
        .send({
          uploads: [
            {
              index: 0,
              size: -3234,
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid size');
    });
  });

  describe('Validation Start Upload - Multipart', () => {
    it('Invalid multipart value', async () => {
      const response = await api
        .post(`${START_UPLOAD_PATH}?multiparts=true`)
        .send({
          uploads: [
            {
              index: 0,
              size: 3234,
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid multiparts value');
    });

    it('Negative multipart value', async () => {
      const response = await api
        .post(`${START_UPLOAD_PATH}?multiparts=-1`)
        .send({
          uploads: [
            {
              index: 0,
              size: 3234,
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid multiparts value');
    });
  });

  describe('Functionality', () => {
    describe('Normal (non-multipart)', () => {
      it('Non existing bucket', async () => {
        const response = await api
          .post(startUploadEndpoint('f701d5cc906a6f7e294d50f7'))
          .send({
            uploads: [
              {
                index: 0,
                size: 3234,
              },
            ],
          })
          .set(AuthorizationHeader);

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Bucket  not found');
      });

      it('Duplicated indexes', async () => {
        const response = await api
          .post(START_UPLOAD_PATH)
          .send({
            uploads: [
              {
                index: 0,
                size: 3234,
              },
              {
                index: 0,
                size: 32334,
              },
            ],
          })
          .set(AuthorizationHeader);

        expect(response.status).toBe(409);
        expect(response.body.error).toBe('Invalid upload indexes');
      });

      it('Max space reached', async () => {
        const response = await api
          .post(START_UPLOAD_PATH)
          .send({
            uploads: [
              {
                index: 0,
                size: 10_000 * 1024 * 1024,
              },
            ],
          })
          .set(AuthorizationHeader);

        expect(response.status).toBe(420);
        expect(response.body.error).toBe('Max space used');
      });

      it('startUpload works correctly', async () => {
        const startUploadResponse = await startsCorrectly(bucketId, {
          uploads: [
            {
              index: 0,
              size: 1000,
            },
            {
              index: 1,
              size: 10000,
            },
          ],
        });

        const { uploads } = startUploadResponse.body;

        let indexCounter = 0;
        for (const upload of uploads) {
          const { url, urls, index, uuid } = upload;
          expect(url).toBeDefined();
          expect(url).toContain('http');
          expect(urls).toBeNull();
          expect(index).toEqual(indexCounter);
          indexCounter += 1;
          expect(uuid).toBeDefined();
        }
      });
    });

    describe('Multipart', () => {
      it('Multipart on less than 100MB', async () => {
        const response = await api
          .post(`${START_UPLOAD_PATH}?multiparts=4`)
          .send({
            uploads: [
              {
                index: 0,
                size: 1000,
              },
            ],
          })
          .set(AuthorizationHeader);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe(
          'Multipart is not allowed for small files'
        );
      });

      it('Multipart startUpload works correctly', async () => {
        const multiparts = 3;
        const startUploadResponse = await startsCorrectly(
          bucketId,
          {
            uploads: [
              {
                index: 0,
                size: 100 * 1024 * 1024,
              },
              {
                index: 1,
                size: 100 * 1024 * 1024,
              },
            ],
          },
          multiparts
        );

        const { uploads } = startUploadResponse.body;

        let indexCounter = 0;
        for (const upload of uploads) {
          const { url, urls, index, uuid, UploadId } = upload;
          expect(url).toBeNull();
          expect(urls).toBeDefined();
          expect(urls.length).toEqual(3);
          expect(uuid).toBeDefined();
          expect(UploadId).toBeDefined();
          expect(index).toBe(indexCounter);
          indexCounter += 1;
          for (const urlToUpload of urls) {
            expect(urlToUpload).toContain('http');
          }
        }
      });
    });
  });
});
