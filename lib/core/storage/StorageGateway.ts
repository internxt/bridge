import axios from "axios";
import { Contact } from "../contacts/Contact";
import logger from "../../logger";

export class StorageGateway {
  static async stores(contact: Contact, objectKey: string): Promise<boolean> {
    const { address, port } = contact;

    const httpUrl = `http://${address}:${port}/v2/shard/${objectKey}/exists`;

    return axios.get(httpUrl).then((res) => {
      if (res.status === 200) {
        return true;
      }

      return false;
    }).catch((err) => {
      console.log('Error checking object storage', err);
      return false;
    });
  }


  static async getMeta(contact: Contact, objectKey: string): Promise<{ size: number } | null> {
    const { address, port } = contact;

    const httpUrl = `http://${address}:${port}/v2/shard/${objectKey}/meta`;

    try {
      const response = await axios.get(httpUrl);
      return response.data;
    } catch (err) {
      const isAxiosError = axios.isAxiosError(err);

      if (isAxiosError) {
        logger.error(`[StorageGateway][GetMeta] Error fetching object meta ${JSON.stringify({
          url: httpUrl,
          objectKey,
          message: err.message,
          statusCode: err.response?.status,
          responseData: err.response?.data,
          code: err.code,
          stack: err.stack,
        })}`);

        if (err.response?.status === 404) {
          return null;
        }
      }

      throw err;
    }
  }

  static async getLinks(contact: Contact, objectKeys: string[]): Promise<string[]> {
    const { address, port } = contact;
  
    const httpUrl = `http://${address}:${port}/v2/download/links?keys=${objectKeys.join(',')}`;

    const res = await axios.get<string[]>(httpUrl);

    return res.data;
  }
}
