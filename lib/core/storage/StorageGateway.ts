import axios from "axios";
import { Contact } from "../contacts/Contact";

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
}
