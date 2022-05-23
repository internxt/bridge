Bridge
=
[![ci](https://github.com/internxt/bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/internxt/bridge/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/internxt/bridge/branch/master/graph/badge.svg?token=5D9UW1HSCK)](https://codecov.io/gh/internxt/bridge)
[![node](https://img.shields.io/badge/node-14.18-brightgreen)](https://nodejs.org/download/release/latest-fermium/)


## Quick setup
---
### ubuntu/macOS:

```
sudo apt install build-essential
```

The dependencies could be installed using:
```
yarn --ignore-engines
```

## Config
---
When this project is run for the first time, the default configuration could be found at `~/.inxt-bridge/config/develop.json`.


> **Note:** Using a .env file instead of the JSON config is preferred, but both methods are currently accepted. The .env will override any value created by the JSON config.
