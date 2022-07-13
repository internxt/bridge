import { v4 as uuidv4, v3 as uuidv3 } from 'uuid';
import { startUploadEndpoint } from './startUpload.e2e-spec.test';
import crypto from 'crypto';
import axios from 'axios';
import {
  api,
  AuthorizationHeader,
  registerSampleUserAndGetBucketId,
} from '../setup';

let bucketId: string;
let FINISH_UPLOAD_PATH: string;

export const finishUploadEndpoint = (bucketId: string) =>
  `/v2/buckets/${bucketId}/files/finish`;

describe('Finish Upload v2', () => {
  beforeAll(async () => {
    bucketId = await registerSampleUserAndGetBucketId();
    FINISH_UPLOAD_PATH = finishUploadEndpoint(bucketId);
  });

  describe('Validation Finish Upload (non-multipart)', () => {
    it('Mising body', async () => {
      const response = await api
        .post(FINISH_UPLOAD_PATH)
        .send({})
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing parameters');
    });

    it('Mising index', async () => {
      const response = await api
        .post(FINISH_UPLOAD_PATH)
        .send({
          shards: [
            {
              hash: 'ba20c3927245283f1fddaf94be044227724600df',
              uuid: uuidv4(),
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing parameters');
    });

    it('Invalid index', async () => {
      const response = await api
        .post(FINISH_UPLOAD_PATH)
        .send({
          index:
            'c34695282e2fc4bf58833d9fc607c61da69b5b5c74e6224ec30f559c9a27043',
          shards: [
            {
              hash: 'ba20c3927245283f1fddaf94be044227724600df',
              uuid: uuidv4(),
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid index');
    });

    it('Missing shards', async () => {
      const response = await api
        .post(FINISH_UPLOAD_PATH)
        .send({
          index:
            '0c34695282e2fc4bf58833d9fc607c61da69b5b5c74e6224ec30f559c9a27043',
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing parameters');
    });

    it('Shards is not an array', async () => {
      const response = await api
        .post(FINISH_UPLOAD_PATH)
        .send({
          index:
            '0c34695282e2fc4bf58833d9fc607c61da69b5b5c74e6224ec30f559c9a27043',
          shards: true,
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Shards is not an array');
    });

    it('Shards Invalid uuid', async () => {
      const response = await api
        .post(FINISH_UPLOAD_PATH)
        .send({
          index:
            '0c34695282e2fc4bf58833d9fc607c61da69b5b5c74e6224ec30f559c9a27043',
          shards: [
            {
              hash: 'ba20c3927245283f1fddaf94be044227724600df',
              uuid: 'uuid-fake',
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid UUID');
    });

    it('Shards Missing hash', async () => {
      const response = await api
        .post(FINISH_UPLOAD_PATH)
        .send({
          index:
            '0c34695282e2fc4bf58833d9fc607c61da69b5b5c74e6224ec30f559c9a27043',
          shards: [
            {
              uuid: uuidv4(),
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing hash');
    });

    it('Shards Missing uuid', async () => {
      const response = await api
        .post(FINISH_UPLOAD_PATH)
        .send({
          index:
            '0c34695282e2fc4bf58833d9fc607c61da69b5b5c74e6224ec30f559c9a27043',
          shards: [
            {
              hash: 'ba20c3927245283f1fddaf94be044227724600df',
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid UUID');
    });
  });

  describe('Validation Finish Upload - Multipart', () => {
    it('Invalid multipart value, missing parts', async () => {
      const response = await api
        .post(FINISH_UPLOAD_PATH)
        .send({
          index:
            '0c34695282e2fc4bf58833d9fc607c61da69b5b5c74e6224ec30f559c9a27043',
          shards: [
            {
              hash: 'ba20c3927245283f1fddaf94be044227724600df',
              uuid: uuidv4(),
              UploadId: 'some_id',
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        'For multipart: must provide also the number of parts'
      );
    });

    it('Invalid multipart value, missing UploadId', async () => {
      const response = await api
        .post(FINISH_UPLOAD_PATH)
        .send({
          index:
            '0c34695282e2fc4bf58833d9fc607c61da69b5b5c74e6224ec30f559c9a27043',
          shards: [
            {
              hash: 'ba20c3927245283f1fddaf94be044227724600df',
              uuid: uuidv4(),
              parts: 4,
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        'For multipart: must provide also the UploadId for this upload'
      );
    });

    it('Negative multipart value', async () => {
      const response = await api
        .post(FINISH_UPLOAD_PATH)
        .send({
          index:
            '0c34695282e2fc4bf58833d9fc607c61da69b5b5c74e6224ec30f559c9a27043',
          shards: [
            {
              hash: 'ba20c3927245283f1fddaf94be044227724600df',
              uuid: uuidv4(),
              UploadId: 'some_id',
              parts: -4,
            },
          ],
        })
        .set(AuthorizationHeader);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        'For multipart: Invalid number of parts'
      );
    });
  });

  describe('Finish Upload functionality', () => {
    describe('Normal (non-multipart)', () => {
      it('Non existing bucket', async () => {
        const response = await api
          .post(finishUploadEndpoint('f701d5cc906a6f7e294d50f7'))
          .send({
            index:
              '0c34695282e2fc4bf58833d9fc607c61da69b5b5c74e6224ec30f559c9a27043',
            shards: [
              {
                hash: 'ba20c3927245283f1fddaf94be044227724600df',
                uuid: uuidv4(),
              },
            ],
          })
          .set(AuthorizationHeader);

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Bucket  not found');
      });

      it('Missing uploads', async () => {
        const startUploadResponse = await api
          .post(startUploadEndpoint(bucketId))
          .send({
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
          })
          .set(AuthorizationHeader);

        const { uploads } = startUploadResponse.body;

        const index = crypto.randomBytes(32).toString('hex');
        const response = await api
          .post(FINISH_UPLOAD_PATH)
          .send({
            index,
            shards: [
              {
                hash: 'ba20c3927245283f1fddaf94be044227724600df',
                uuid: uploads[0].uuid,
              },
              {
                hash: 'ca20c3927245283f1fddaf94be044227724600df',
                // Fake uuid:
                uuid: uuidv4(),
              },
            ],
          })
          .set(AuthorizationHeader);

        expect(response.status).toBe(409);
        expect(response.body.error).toBe(
          'Missing uploads to complete the upload'
        );
      });
    });

    it('Uploads and finishes correctly', async () => {
      const startUploadResponse = await api
        .post(startUploadEndpoint(bucketId))
        .send({
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
        })
        .set(AuthorizationHeader);

      const { uploads } = startUploadResponse.body;

      for (const [i, upload] of uploads.entries()) {
        const { url, urls, index, uuid } = upload;
        expect(url).toBeDefined();
        expect(url).toContain('http');
        expect(urls).toBeNull();
        expect(index).toEqual(i);
        expect(uuid).toBeDefined();
        const file = crypto.randomBytes(50).toString('hex');
        await axios.put(url, file, {
          headers: {
            'Content-Type': 'application/octet-stream',
          },
        });
      }

      const index = crypto.randomBytes(32).toString('hex');
      const responseComplete = await api
        .post(FINISH_UPLOAD_PATH)
        .send({
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
        })
        .set(AuthorizationHeader);

      expect(responseComplete.status).toBe(200);

      const {
        bucket,
        created,
        filename,
        id,
        index: indexResponse,
        mimetype,
        renewal,
        size,
        version,
      } = responseComplete.body;

      expect(bucket).toEqual(bucketId);
      expect(created).toBeDefined();
      expect(filename).toBeDefined();
      expect(id).toBeDefined();
      expect(indexResponse).toEqual(index);
      expect(mimetype).toBeDefined();
      expect(renewal).toBeDefined();
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
      expect(version).toBe(2);
    });

    describe('Multipart', () => {
      it('Uploads multipart starts and finishes correctly', async () => {
        const startUploadResponse = await api
          .post(`${startUploadEndpoint(bucketId)}?multiparts=3`)
          .send({
            uploads: [
              {
                index: 0,
                size: 200 * 1024 * 1024,
              },
              {
                index: 1,
                size: 200 * 1024 * 1024,
              },
            ],
          })
          .set(AuthorizationHeader);

        const { uploads } = startUploadResponse.body;
        const uploadParts: { ETag: string; PartNumber: number }[][] = [];
        for (const upload of uploads) {
          // console.log(i);
          const { url, urls, index, uuid, UploadId } = upload;
          expect(url).toBeNull();
          expect(urls).toBeDefined();
          expect(urls.length).toEqual(3);
          // expect(index).toEqual(i);
          expect(uuid).toBeDefined();
          expect(UploadId).toBeDefined();
          const parts: { ETag: string; PartNumber: number }[] = [];
          let PartNumber = 1;
          for (const urlToUpload of urls) {
            expect(urlToUpload).toContain('http');
            const file = crypto.randomBytes(50).toString('hex');
            try {
              const responseUpload = await axios.put(urlToUpload, file, {
                headers: {
                  'Content-Type': 'application/octet-stream',
                },
              });
            } catch (err) {
              console.log(err);
            }
            // responseUpload.headers.Etag;
            // parts.push({
            //   ETag: responseUpload.headers.Etag,
            //   PartNumber,
            // });
            // PartNumber += 1;
            // expect(responseUpload.status).toEqual(200);
          }
          uploadParts.push(parts);
        }

        const index = crypto.randomBytes(32).toString('hex');
        const responseComplete = await api
          .post(FINISH_UPLOAD_PATH)
          .send({
            index,
            shards: [
              {
                UploadId: uploads[0].UploadId,
                parts: uploadParts[0],
                hash: crypto.randomBytes(20).toString('hex'),
                uuid: uploads[0].uuid,
              },
              {
                UploadId: uploads[1].UploadId,
                parts: uploadParts[1],
                hash: crypto.randomBytes(20).toString('hex'),
                uuid: uploads[1].uuid,
              },
            ],
          })
          .set(AuthorizationHeader);

        expect(responseComplete.status).toBe(200);

        const {
          bucket,
          created,
          filename,
          id,
          index: indexResponse,
          mimetype,
          renewal,
          size,
          version,
        } = responseComplete.body;

        expect(bucket).toEqual(bucketId);
        expect(created).toBeDefined();
        expect(filename).toBeDefined();
        expect(id).toBeDefined();
        expect(indexResponse).toEqual(index);
        expect(mimetype).toBeDefined();
        expect(renewal).toBeDefined();
        expect(size).toBeGreaterThan(0);
        expect(typeof size).toBe('number');
        expect(version).toBe(2);
      });
    });
  });
});
