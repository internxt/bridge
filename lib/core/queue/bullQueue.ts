import { ConnectionOptions, Queue } from 'bullmq';

export const QUEUE_NAME = 'NETWORK_WORKER_TASKS_QUEUE';

let queue: Queue | null = null;

function buildConnection(cfg: {
    NEW_QUEUE_HOST: string;
    NEW_QUEUE_PORT: number;
    NEW_QUEUE_USERNAME: string;
    NEW_QUEUE_PASSWORD: string;
    NODE_ENV: string;
}) {
  console.log('cfg', cfg);
  const connection: Partial<ConnectionOptions> = {
    host: (cfg && cfg.NEW_QUEUE_HOST) || process.env.NEW_QUEUE_HOST,
    port: cfg && cfg.NEW_QUEUE_PORT ? Number(cfg.NEW_QUEUE_PORT) : (process.env.NEW_QUEUE_PORT ? Number(process.env.NEW_QUEUE_PORT) : undefined),
    username: (cfg && cfg.NEW_QUEUE_USERNAME) || process.env.NEW_QUEUE_USERNAME,
    password: (cfg && cfg.NEW_QUEUE_PASSWORD) || process.env.NEW_QUEUE_PASSWORD,
  };

  if ((cfg && cfg.NODE_ENV) === 'production' || process.env.NODE_ENV === 'production') {
    connection.tls = { servername: connection.host };
  }

  return connection;
}

export function init(cfg?: any): Queue {
  if (queue) return queue;
  const connection = buildConnection(cfg);
  queue = new Queue(QUEUE_NAME, { connection });

  queue.on('error', (err: any) => {
    console.error('bullQueue error:', err && err.message ? err.message : err);
  });

  return queue;
}

export function getQueue(): Queue | null {
  return queue;
}

export async function close(): Promise<void> {
  if (!queue) return;
  try {
    await queue.close();
  } catch (err: any) {
    console.error('Error closing bullQueue:', err && err.message ? err.message : err);
  } finally {
    queue = null;
  }
}