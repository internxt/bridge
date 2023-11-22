#!/usr/bin/env node

'use strict';

const program = require('commander');
const Config = require('../lib/config');
const Engine = require('../lib/engine');

program.option('-c, --config <path_to_config_file>', 'path to the config file');
program.option('-d, --datadir <path_to_datadir>', 'path to the data directory');
program.parse(process.argv);

const config = new Config(process.env.NODE_ENV || 'develop', program.config, program.datadir);
const engine = new Engine(config);

engine.start(function (err: Error) {
  if (err) {
    console.log(err);
  }
});

module.exports = engine;
