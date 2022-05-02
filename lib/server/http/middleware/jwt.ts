import { RequestHandler } from "express";
import { verify, VerifyOptions } from 'jsonwebtoken';
import { BadRequestError, ForbiddenError, NotAuthorizedError } from "storj-service-error-types";

export function buildMiddleware(secret: string, opts: Partial<VerifyOptions>): RequestHandler {
  return (req, _, next) => {
    const auth = req.headers['authorization'];
    if (!auth) {
      return next(NotAuthorizedError())
    }

    const token = auth && auth.split('Bearer ')[1];

    if (token === null) {
      return next(BadRequestError());
    }

    verify(token, secret, opts, (err, decoded) => {
      if (err) {
        return next(ForbiddenError());
      }

      (req as any).payload = decoded;

      next();
    });
  };
}
