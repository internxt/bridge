const connect = require('amqplib').connect;
const logger = require('../../logger');

const RETRIES_TO_CONNECT = 100;

class NetworkMessageQueue {
  opts;
  connection;
  channel;
  connectingAttempts = 0;

  constructor(opts) {
    this.opts = opts;
  }
  
  connectAndRetry(cb) {
    const connectionInterval = setInterval(() => {
      if (this.connectingAttempts <= RETRIES_TO_CONNECT) {
        this.init((err) => {
          if (err) {
            this.connectingAttempts += 1;
            if (this.connectingAttempts <= RETRIES_TO_CONNECT) {
              logger.error(
                'Failed to connect to RabbitMQ, Attempt #: %s',
                this.connectingAttempts
              );
              console.log(err);
            } else {
              cb(err);
            }
          } else {
            clearInterval(connectionInterval);
            logger.info('Connected successfully to RabbitMQ');
            cb();
          }
        });
      }
      else {
        clearInterval(connectionInterval);
        cb(new Error('Failed to connect to RabbitMQ'));
      }
    }, 4000);
  }

  init(cb) {
    connect(this.opts.connection.url)
      .then((connection) => {
        this.connection = connection;
        return connection
          .createChannel()
          .then((channel) => {
            this.channel = channel;
            return this.channel.assertExchange(
              this.opts.exchange.name,
              this.opts.exchange.type
            );
          })
          .then(() => {
            return this.channel.assertQueue(this.opts.queue.name);
          })
          .then(() => {
            return this.channel.bindQueue(
              this.opts.queue.name,
              this.opts.exchange.name,
              this.opts.routingKey.name
            )
            .then(() => {
              cb()
            })
            .catch(cb);
          })
          .catch(cb);
      })
      .catch(cb);
  }

  close(cb) {
    if (this.channel) {
      this.channel.close().then(() => {
          this.connection.close().then(() => {
              logger.info('Queue closed');
              cb();
            })
            .catch(cb);
        })
        .catch(cb);
    }
    else {
      this.connection.close().then(() => {
        logger.info('Queue closed');
        cb();
      }).catch(cb);
    }
  }

  enqueueMessage(message, cb) {
    const type = message.type;
    const payload = message.payload;

    const serializedMessage = JSON.stringify({ type, payload });
    this.channel.sendToQueue(
      this.opts.queue.name,
      Buffer.from(serializedMessage)
    ).then(() => {
      cb();
    }).catch(cb)
  }
}

module.exports = NetworkMessageQueue;
