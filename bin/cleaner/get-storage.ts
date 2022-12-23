const StorjStorage = require('storj-service-storage-models');
const log = require('../../lib/logger');

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const getNetworkDatabase = async (config) => {
    await wait(3000);
    return new StorjStorage(config.storage.mongoUrl, config.storage.mongoOpts, { logger: log });
}
