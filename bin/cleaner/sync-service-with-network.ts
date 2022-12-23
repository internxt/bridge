import commander from "commander";
import fetch from "node-fetch";

import { getNetworkDatabase } from "./get-storage";
import buildRemoveFiles from "./remove-files";

const Config = require('../../lib/config');

commander.option('-b, --bucket <bucket_id>', 'Bucket to clean');
commander.option('-u, --url <service_file_existence_url>', 'Service url to check file existence');
commander.parse(process.argv);

const config = new Config(process.env.NODE_ENV || 'develop', commander.config, commander.datadir);

async function checkFileExistence(fileId: string, serviceFileExistenceCheckUrl: string): Promise<boolean> {
    const response = await fetch(`${serviceFileExistenceCheckUrl}/${fileId}`);

    return !(response.status === 404);
}

/**
 * Syncs the service with the network by removing files that are not in the service but there are in the network.
 * @param bucketId Bucket where files are in
 * @param serviceFileExistenceCheckUrl Service url where to check file existence
 */
async function syncServiceWithNetwork(bucketId: string, serviceFileExistenceCheckUrl: string): Promise<void> {
    const { models } = await getNetworkDatabase(config);
    const { BucketEntry } = models;

    const removeFiles = buildRemoveFiles(config, models);

    const iterator = BucketEntry.find({ bucket: bucketId }).cursor();

    for (let file = await iterator.next(); file; file = await iterator.next()) {
        const fileExists = await checkFileExistence(file._id, serviceFileExistenceCheckUrl);

        if (!fileExists) {
            await removeFiles([file._id]);
        }
    }
}

syncServiceWithNetwork(commander.bucket, commander.url).then(() => {
    console.log('Done');
    process.exit(0);
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
