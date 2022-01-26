const connect = require("amqplib").connect;
const log = require('../../logger');

const RETRIES_TO_CONNECT = 100;

class NetworkMessageQueue {
  opts;
  channel;
  connectingAttempts = 0;

  constructor(opts) {
    this.opts = opts;
    this.connectAndRetry((err) => {
      if (err) {
        log.error(
          `Tried ${RETRIES_TO_CONNECT} time(s) to connect to RabbitMQ, failed. Error : %s `,
          err.message
        );
        log.error(err);
        return;
      }
      log.info("Connected Successfully to RabbitMQ");
    });
  }

  connectAndRetry(cb) {
    const interval_id = setInterval(() => {
      if (this.connectingAttempts <= RETRIES_TO_CONNECT) {
        this.init((err) => {
          if (err) {
            this.connectingAttempts += 1;
            if (this.connectingAttempts <= RETRIES_TO_CONNECT) {
              log.error(
                "Failed to connect to RabbitMQ, Attempt #: %s",
                this.connectingAttempts
              );
            } else {
              cb(err);
            }
          } else {
            clearInterval(interval_id);
            log.info("Connected successfully to RabbitMQ");
          }
        });
      }
    }, 4000);
  }

  init(cb) {
    connect(this.opts.connection.url)
      .then((conn) => {
        return conn
          .createChannel()
          .then((ch) => {
            this.channel = ch;
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
              cb();
            })
            .catch((err) => {
              cb(err);
            });
          })
          .catch((err) => {
            cb(err);
          });
      })
      .catch((err) => {
        cb(err);
      });
  }

  enqueueMessage(message, cb) {
    if (!this.channel) {
      return cb(Error("Channel not opened yet"));
    }

    const type = message.type;
    const payload = message.payload;

    const serialized_message =  JSON.stringify({ type, payload });
    this.channel.sendToQueue(
      this.opts.queue.name,
      Buffer.from(serialized_message)
    );
    cb();
  }
}

module.exports = NetworkMessageQueue;
