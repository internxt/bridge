'use strict';

const assert = require('assert');
const os = require('os');
const rc = require('rc');
const fs = require('fs');
const path = require('path');
const merge = require('merge');

const ENV = process.env;
const PLATFORM = os.platform();
const DIRNAME = '.inxt-bridge';
const HOME = PLATFORM === 'win32' ? ENV.USERPROFILE : ENV.HOME;
const STORJ_BRIDGE_PATH = ENV.STORJ_BRIDGE_DIR || HOME;
const DATADIR = path.join(STORJ_BRIDGE_PATH, DIRNAME);
const CONSTANTS = require('./constants');

const utils = require('./utils');

const DEFAULTS = {
  storage: {
    mongoUrl: `mongodb://127.0.0.1:27017/__storj-bridge-${process.env.NODE_ENV || 'develop'}`,
    mongoOpts: {}
  },
  server: {
    host: '127.0.0.1',
    port: 6382,
    timeout: 240000,
    ssl: {
      cert: null,
      key: null,
      ca: [],
      redirect: 80
    },
    public: {
      host: '127.0.0.1',
      port: 80
    },
    corsRegex: '^https?://(\\w{1,63}\\.){0,6}?internxt\\.com$'
  },
  complex: {
    rpcUrl: 'http://localhost:8080',
    rpcUser: 'user',
    rpcPassword: 'pass'
  },
  logger: {
    level: CONSTANTS.LOG_LEVEL_INFO
  },
  mailer: {
    host: '127.0.0.1',
    port: 465,
    secure: true,
    auth: {
      user: 'username',
      pass: 'password'
    },
    from: 'activate@internxt.com',
    sendgrid: {
      api_key: '',
      sandbox_mode: false,
      delete_template_id: '',
    }
  },
  application: {
    delayedActivation: false, // send delayed user activation email
    activateSIP6: true,
    powOpts: {
      retargetPeriod: 10000, // milliseconds
      retargetCount: 10, // per retargetPeriod
    },
    timeoutRateThreshold: 0.04,
    maxInterval: '3m',
    minInterval: '1m',
    queryNumber: 100,
    pingConcurrency: 10,
    publishBenchThreshold: 2500, // reputation
    publishTotal: 36, // number of farmers to publish in active pool
    publishBenchTotal: 9, // number of farmers to publish in bench pool
    shardsPerMinute: 50000,
    farmerTimeoutIgnore: '2m',
    freeTier: {
      up: {
        hourlyBytes: 3000000000,
        dailyBytes: 10000000000,
        monthlyBytes: 60000000000
      },
      down: {
        hourlyBytes: 9000000000,
        dailyBytes: 30000000000,
        monthlyBytes: 180000000000
      }
    },
    CLUSTER: []
  },
  nodes: {
    username: 'test_oefrvjsfe4dl',
    password: 'test_3747hffepcjrv'
  },
  redis: {
    host: 'localhost',
    port: 6379
  },
  stripe: {
    PK_TEST: '',
    SK_TEST: '',
    PK_LIVE: '',
    SK_LIVE: '',
    SIG: '',
    SIG_TEST: ''
  },
  api_keys: {
    segment: 'abcdefg12345'
  },
  gateway: {
    username: 'username',
    password: 'password'
  },
  drive: {
    api: ''
  }
};

function getPaths(env, confpath, datadir) {
  const paths = {};
  if (datadir) {
    assert(path.isAbsolute(datadir), 'datadir is expected to be absolute');
    paths.datadir = datadir;
  } else {
    paths.datadir = DATADIR;
  }
  if (confpath) {
    assert(path.isAbsolute(confpath), 'confpath is expected to be absolute');
    paths.confdir = path.dirname(confpath);
    paths.confpath = confpath;
  } else {
    paths.confdir = path.join(paths.datadir, 'config');
    assert(env, 'env is expected without config path');
    paths.confpath = path.join(paths.confdir, env);
  }

  return paths;
}

function setupConfig(paths) {
  if (!fs.existsSync(paths.confdir)) {
    fs.mkdirSync(paths.confdir);
  }
  if (!fs.existsSync(paths.confpath)) {
    fs.writeFileSync(paths.confpath, JSON.stringify(DEFAULTS, null, 2));
  }
}

function setupDataDirectory(paths) {
  if (!fs.existsSync(paths.datadir)) {
    fs.mkdirSync(paths.datadir);
  }
  const itemdir = path.join(paths.datadir, 'items');
  if (!fs.existsSync(itemdir)) {
    fs.mkdirSync(itemdir);
  }
}

/**
 * Represents a configuration
 * @constructor
 * @param {String|Object} arg
 */
function Config(env, confpath, datadir) {
  if (!(this instanceof Config)) {
    return new Config(env, confpath, datadir);
  }

  let config;

  if (typeof env === 'string') {

    const paths = Config.getPaths(env, confpath, datadir);
    Config.setupDataDirectory(paths);
    Config.setupConfig(paths);

    config = merge.recursive(
      JSON.parse(JSON.stringify(DEFAULTS)),
      JSON.parse(fs.readFileSync(paths.confpath))
    );

  } else {
    config = merge.recursive(
      JSON.parse(JSON.stringify(DEFAULTS)),
      env
    );
  }

  config = rc('inxtbridge', config);

  for (let prop in config) {
    this[prop] = utils.recursiveExpandJSON(config[prop]);
  }

}

Config.DEFAULTS = DEFAULTS;
Config.setupDataDirectory = setupDataDirectory;
Config.setupConfig = setupConfig;
Config.getPaths = getPaths;

module.exports = Config;
