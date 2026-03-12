import axios from 'axios';
import { StorageGateway } from '../../../../lib/core/storage/StorageGateway';
import fixtures from '../fixtures';
import { v4 } from 'uuid';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('StorageGateway', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getMeta()', () => {
    it('When the request succeeds, then it should return response.data', async () => {
      const contact = fixtures.getContact({ address: 'storage.example.com', port: 3000 });
      const objectKey = v4();
      const meta = { size: 1024 };

      mockedAxios.get.mockResolvedValueOnce({ data: meta });

      const result = await StorageGateway.getMeta(contact, objectKey);

      expect(result).toStrictEqual(meta);
    });

    it('When called, then it should construct the correct URL from contact address, port and objectKey', async () => {
      const contact = fixtures.getContact({ address: 'mynode.example.com', port: 4567 });
      const objectKey = v4();

      mockedAxios.get.mockResolvedValueOnce({ data: { size: 512 } });

      await StorageGateway.getMeta(contact, objectKey);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        `http://mynode.example.com:4567/v2/shard/${objectKey}/meta`
      );
    });

    it('When the storage node returns a 404, then it should return null', async () => {
      const contact = fixtures.getContact();
      const objectKey = v4();

      const axiosError = Object.assign(new Error('Not Found'), {
        isAxiosError: true,
        response: { status: 404 },
      });

      mockedAxios.get.mockRejectedValueOnce(axiosError);
      mockedAxios.isAxiosError.mockReturnValueOnce(true);

      const result = await StorageGateway.getMeta(contact, objectKey);

      expect(result).toBeNull();
    });

    it('When the storage node returns a non-404 error, then it should re-throw the error', async () => {
      const contact = fixtures.getContact();
      const objectKey = v4();

      const axiosError = Object.assign(new Error('Internal Server Error'), {
        isAxiosError: true,
        response: { status: 500 },
      });

      mockedAxios.get.mockRejectedValueOnce(axiosError);
      mockedAxios.isAxiosError.mockReturnValueOnce(true);

      await expect(StorageGateway.getMeta(contact, objectKey)).rejects.toThrow('Internal Server Error');
    });

    it('When a non-axios error occurs, then it should re-throw the error', async () => {
      const contact = fixtures.getContact();
      const objectKey = v4();

      const networkError = new Error('Network failure');

      mockedAxios.get.mockRejectedValueOnce(networkError);
      mockedAxios.isAxiosError.mockReturnValueOnce(false);

      await expect(StorageGateway.getMeta(contact, objectKey)).rejects.toThrow('Network failure');
    });
  });
});
