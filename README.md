Network
=
[![ci](https://github.com/internxt/bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/internxt/bridge/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/internxt/bridge/branch/master/graph/badge.svg?token=5D9UW1HSCK)](https://codecov.io/gh/internxt/bridge)
[![node](https://img.shields.io/badge/node-14.18-brightgreen)](https://nodejs.org/download/release/latest-fermium/)

The Internxt's Storage API.

## Config


## Table of Contents

- [Quick Setup](#quick-setup)
- [Install](#how-to-install)
- [Start the app](#start-app)
  - [Start with docker](#running-in-docker)
- [Testing](#testing)
  - [Unit Testing](#unit-testing)
  - [End to End Testing](#end-to-end-testing)
- [Guideline Nest.js](#guideline-nest.js)
  - [Modules](#modules)
    - [Controllers](#defining-controllers)
    - [Domain](#defining-domain)
    - [Use Cases](#defining-use-cases)
    - [Repository](#defining-repository)
  - [Externals](#externals)
  - [Config](#conig)
  - [Middlewares](#middlewares)
  - [Libs](#libs)
- [API Documentation](#api-documentation)

## Quick Setup
### ubuntu/macOS:

```
sudo apt install build-essential
```

The dependencies could be installed using:
```
yarn --ignore-engines
```

## How to Install

- Create a `.npmrc` file from the `.npmrc.template` example provided in the repo. 
- Replace `TOKEN` with your own [Github Personal Access Token](https://docs.github.com/en/github/authenticating-to-github/keeping-your-account-and-data-secure/creating-a-personal-access-token) with `read:packages` permission **ONLY**
- Use `yarn` to install project dependencies.

When this project is run for the first time, the default configuration can be found at `~/.inxt-bridge/config/develop.json`.

> **Note:** Using a .env (see .env.template) file instead of the JSON config is preferred, but both methods are currently accepted. The .env will override any value created by the JSON config.

## Start app

Run `yarn run dev` to start the server with hot-reloading.

### Running in docker:

With docker-compose:
```bash
docker-compose up
```

## Testing

You can run tests with:

```
yarn run test
```

## Project guideline
This project currently divides the server into 3 layers: 
- Use cases (```lib/core/${domain}/usecase.ts``` or if not still migrated: ```lib/server/routes/${domain}.js```)
- Persistence (```lib/core/${domain}/repository.ts``` or if not still migrated: ```lib/server/routes/${domain}.js```)
- Controllers (```lib/server/http/${domain}/controller.ts``` or if not still migrated: ```lib/server/routes/${domain}.js```)

The project has these main folders
- ```/lib```
  - ```/core```: where a new structure with 2 of the 3 layers is being used (use case, persistence)
  - ```/server```:
    - ```/routes```: where old structure with one layer (controller+usecase+persistence) is being used.
    - ```/http/${domain}```: where controller layer for the HTTP protocol resides. 

The project is a WIP in the sense that is being rethought in layers and the actual 3 layers are a matter of convenience that provides better maintainability that the old solution of using one layer with everything mixed.

As the word 'domain' is being used, we have agreed to use any entity as a domain (which is not correct) as a temporal convention, therefore, any explanation about how to define this layers is provided here. Each entity has maybe a controller, use case, and repo, that is the unique guideline for now. 
  
## API documentation
We do not provide API documentation currently. We plan to do it in the future.

## License
This project is based on GNU License. You can show it in the [License](LICENSE) file.
