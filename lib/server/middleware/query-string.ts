/**
 * @module inxt-bridge/server/middleware/query-string
 */
import { RequestHandler } from "express";
import queryString from "querystring";

const querystring: RequestHandler = (req, res, next) => {
    req.query = queryString.parse((req as any).query());
    next();
};

export { querystring };
