/**
 * @module inxt-bridge/server/middleware/error-handler
 */

import { ErrorRequestHandler } from 'express';

interface Logger {
  error: (message: string, ...args: unknown[]) => void;
}

function ErrorHandlerFactory(options: { logger?: Logger }): ErrorRequestHandler {
  const log: Logger = options.logger ?? console;

  return function errorhandler(err, req, res, next) {
    if (err) {
      const statusCode = err.code ? (err.code > 500 ? 400 : err.code) : 500;
      if (statusCode >= 500) {
        log.error('request error: %s', err.message);
        log.error(err.stack);
      }

      return res.status(statusCode).send({ error: err.message });
    }
    next();
  };
}

export { ErrorHandlerFactory };
