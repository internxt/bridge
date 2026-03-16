import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store as requestContextStore } from '../../requestContext';
import log from '../../logger';

const getDurationInMilliseconds = (start: [number, number]): number => {
  const NS_PER_SEC = 1e9;
  const NS_TO_MS = 1e6;
  const diff = process.hrtime(start);

  return (diff[0] * NS_PER_SEC + diff[1]) / NS_TO_MS;
};

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const ctx = {
    requestId: uuidv4(),
    clientId: req.headers['internxt-client'] as string | undefined,
  };

  requestContextStore.run(ctx, () => {
    res.locals.requestContext = ctx;
    res.setHeader('X-Request-Id', ctx.requestId);
    log.info(`${req.method} ${req.originalUrl} [STARTED]`);
    const start = process.hrtime();

    res.on('finish', () => {
      requestContextStore.run(ctx, () => {
        const durationInMilliseconds = getDurationInMilliseconds(start);
        log.info(`${req.method} ${req.originalUrl} [FINISHED] ${res.statusCode} ${durationInMilliseconds.toLocaleString()} ms`);
      });
    });

    res.on('close', () => {
      requestContextStore.run(ctx, () => {
        const durationInMilliseconds = getDurationInMilliseconds(start);
        log.info(`${req.method} ${req.originalUrl} [CLOSED] ${res.statusCode} ${durationInMilliseconds.toLocaleString()} ms`);
      });
    });

    next();
  });
}

export function unexpectedErrorLogger(err: Error, req: Request, res: Response, next: NextFunction): void {
  log.error(`${req.method} ${req.originalUrl} [UNEXPECTED_ERROR] ${err.message}`, err.stack);
  next(err);
}
