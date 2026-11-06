/**
 * @module inxt-bridge/server/middleware/query-string
 */
import { RequestHandler } from "express";
import queryString from "querystring";
import url from "url";

const querystring: RequestHandler = (req, res, next) => {
    req.query = queryString.parse(url.parse(req.url).query || "");
    next();
};

export { querystring };
