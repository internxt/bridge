const connect = require('amqplib').connect;
const logger = require('../../logger');

const RETRIES_TO_CONNECT = 10;

const wait = (ms) => new Promise(r => setTimeout(r, ms));

class NetworkMessageQueue {
  constructor(opts) {
    this.connection = null;
    this.channel = null;
    this.connectingAttempts = 0;
    this.opts = opts;
  }

  async connectAndRetry() {
    let connected = false;

    while (!connected && this.connectingAttempts < RETRIES_TO_CONNECT) {
      try {
        await this.init();
        connected = true;
      } catch (err) {
        logger.error(
          'Error connecting to the network queue, Attempt #%s: %s',
          this.connectingAttempts,
          err
        );

        await wait(4000);
      } finally {
        this.connectingAttempts += 1;
      }
    }

    if (!connected) {
      throw new Error(
        `Failed to connect to the network queue after ${this.connectingAttempts} attempts`
      );
    }
  }

  async init() {
    this.connection = await connect(this.opts.connection.url);
    this.channel = await this.connection.createConfirmChannel();

    await this.channel.assertExchange(this.opts.exchange.name, this.opts.exchange.type);
    await this.channel.assertQueue(this.opts.queue.name);
    await this.channel.bindQueue(
      this.opts.queue.name,
      this.opts.exchange.name,
      this.opts.routingKey.name
    );
  }

  async close() {
    if (this.channel) {
      await this.channel.close().catch(() => {
        // no op
      });
    }

    if (this.connection) {
      await this.connection.close().catch(() => {
        // no op
      });
    }

    logger.info('Queue closed');
  }

  enqueueMessage(message, cb) {
    if (!this.channel) {
      return cb(new Error('Channel is not initialized yet'));
    }

    const { type, payload } = message;

    const serializedMessage = JSON.stringify({ type, payload });
    this.channel.sendToQueue(
      this.opts.queue.name,
      Buffer.from(serializedMessage),
      {},
      cb
    );
  }
}

module.exports = NetworkMessageQueue;
