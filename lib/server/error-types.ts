/**
 * @module inxt-bridge/server/errors
 */

export class HTTPError extends Error {
  code: number;
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function makeError(statusCode: number, defaultMessage: string) {
  return (message?: string) => new HTTPError(statusCode, message ?? defaultMessage);
}

export const RateLimited = makeError(429, 'Request rate limited');
export const NotFoundError = makeError(404, 'Resource not found');
export const NotAuthorizedError = makeError(401, 'Not authorized');
export const ForbiddenError = makeError(403, 'Forbidden');
export const InternalError = makeError(500, 'Internal error');
export const BadRequestError = makeError(400, 'Bad request');
export const NotImplementedError = makeError(501, 'Not implemented');
export const ServiceUnavailableError = makeError(503, 'Service Unavailable');
export const TransferRateError = makeError(420, 'Transfer rate limit');
export const ConflictError = makeError(409, 'Conflict');
export const UnprocessableEntityError = makeError(422, 'Unprocessable entity');
