/**
 * @module storj-bridge/logger
 */

'use strict';

const config = require('./config')(process.env.NODE_ENV);
const CONSTANTS = require('./constants');
const { getContext } = require('./requestContext');

const Winston = require('winston');

const myCustomLevels = {
  levels: {
    error: 1,
    warn: 2,
    info: 3,
    debug: 4
  },
  colors: {
    error: 'red',
    info: 'green',
    debug: 'blue',
    warn: 'red'
  }
};

function logLevelName(level) {
  const result = Object.keys(myCustomLevels.levels).filter((key, value) => {
    return value === level;
  });

  if (result.length > 0) {
    return result[0];
  } else {
    return undefined;
  }
}

const logLevel = process.env.NODE_ENV === 'test'
  ? CONSTANTS.LOG_LEVEL_NONE
  : process.env.LOG_LEVEL || config.logger.level;

const injectContext = Winston.format((info) => {
  const { requestId, clientId, version } = getContext();
  info.requestId = requestId || null;
  info.clientId = clientId || null;
  info.version = version || null;

  return info;
});

const devFormat = Winston.format.combine(
  Winston.format.colorize({ all: true }),
  Winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  Winston.format.splat(),
  injectContext(),
  Winston.format.printf(info => {
    const ctx = [info.requestId, info.clientId, info.version]
      .map(v => v || '-')
      .join(' | ');

    return `${info.timestamp} ${info.level} [${ctx}] ${info.message}`;
  })
);

const prodFormat = Winston.format.combine(
  Winston.format.timestamp(),
  Winston.format.splat(),
  injectContext(),
  Winston.format.json()
);

module.exports = Winston.createLogger({
  level: logLevelName(logLevel),
  levels: myCustomLevels.levels,
  format: process.env.NODE_ENV === 'development' ? devFormat : prodFormat,
  transports: [
    new Winston.transports.Console()
  ]
});
