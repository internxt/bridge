import { ConnectionOptions, Queue } from 'bullmq';

export const QUEUE_NAME = 'NETWORK_WORKER_TASKS_QUEUE';

type BullQueueConfig = {
  NEW_QUEUE_HOST?: string;
  NEW_QUEUE_PORT?: number | string;
  NEW_QUEUE_USERNAME?: string;
  NEW_QUEUE_PASSWORD?: string;
  NODE_ENV?: string;
};

let queue: Queue | null = null;

const toNumber = (value?: number | string): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const resolveConfig = (cfg?: BullQueueConfig): Required<Pick<BullQueueConfig, 'NODE_ENV'>> & BullQueueConfig => ({
  NEW_QUEUE_HOST: cfg?.NEW_QUEUE_HOST ?? process.env.NEW_QUEUE_HOST,
  NEW_QUEUE_PORT: cfg?.NEW_QUEUE_PORT ?? process.env.NEW_QUEUE_PORT,
  NEW_QUEUE_USERNAME: cfg?.NEW_QUEUE_USERNAME ?? process.env.NEW_QUEUE_USERNAME,
  NEW_QUEUE_PASSWORD: cfg?.NEW_QUEUE_PASSWORD ?? process.env.NEW_QUEUE_PASSWORD,
  NODE_ENV: cfg?.NODE_ENV ?? process.env.NODE_ENV ?? 'development',
});

function buildConnection(cfg?: BullQueueConfig): ConnectionOptions {
  const resolved = resolveConfig(cfg);

  const connection: ConnectionOptions = {
    host: resolved.NEW_QUEUE_HOST,
    port: toNumber(resolved.NEW_QUEUE_PORT),
    username: resolved.NEW_QUEUE_USERNAME,
    password: resolved.NEW_QUEUE_PASSWORD,
  };

  if (resolved.NODE_ENV === 'production') {
    connection.tls = { servername: resolved.NEW_QUEUE_HOST };
  }

  return connection;
}

function attachQueueListeners(instance: Queue): void {
  instance.on('error', (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('bullQueue error:', message);
  });
}

export function init(cfg?: BullQueueConfig): Queue {
  if (queue) return queue;

  queue = new Queue(QUEUE_NAME, { connection: buildConnection(cfg) });
  attachQueueListeners(queue);

  return queue;
}

export function getQueue(): Queue | null {
  return queue;
}

export async function close(): Promise<void> {
  if (!queue) return;

  try {
    await queue.close();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error closing bullQueue:', message);
  } finally {
    queue = null;
  }
}