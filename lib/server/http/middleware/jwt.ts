import { RequestHandler } from "express";
import { JwtPayload, verify } from 'jsonwebtoken';
import { BadRequestError, ForbiddenError, NotAuthorizedError } from "storj-service-error-types";

export function buildMiddleware(secret: string): RequestHandler {
  return (req, _, next) => {
    const auth = req.headers['authorization'];
    if (!auth) {
      return next(NotAuthorizedError())
    }

    const token = auth && auth.split('Bearer ')[1];

    if (token === null) {
      return next(BadRequestError());
    }

    verify(token, secret, ((err: Error, payload: JwtPayload) => {
      if (err) {
        return next(ForbiddenError());
      }

      (req as any).payload = payload;

      next();
    }) as any);
  };
}
