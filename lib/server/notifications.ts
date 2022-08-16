import axios from 'axios';

type RequestData = {
  event: string;
  idUser: string;
  payload: Record<string, any>;
};

export class Notifications {
  private apiKey: string;
  private endpoint: string;

  constructor(endpoint: string, apiKey: string) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  storageChanged(idUser: string, limit: number): Promise<void> {
    return this.post({
      event: 'LIMIT_CHANGED',
      idUser,
      payload: { limit },
    });
  }

  private async post(data: RequestData): Promise<void> {
    try {
      const res = await axios.post(this.endpoint, data, {
        headers: { 'X-API-KEY': this.apiKey },
      });
      if (res.status !== 201)
        console.warn(
          `Post to notifications service failed with status ${
            res.status
          }. Data: ${JSON.stringify(data, null, 2)}`
        );
    } catch (err) {
      console.warn(
        `Post to notifications service failed with error ${
          (err as Error).message
        }. Data: ${JSON.stringify(data, null, 2)}`
      );
    }
  }
}
