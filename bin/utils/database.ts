import { config as loadEnv } from 'dotenv';
import Config from '../../lib/config';
import DatabaseConnection from '../../lib/models/database';

loadEnv();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface Models {
    BucketEntry: any,
    BucketEntryShard: any,
    Bucket: any,
    Shard: any,
    Mirror: any,
    User: any,
    Frame: any,
    Pointer: any,
    Upload: any,
    Token: any,
    Contact: any,
    FileState: any,
};

export async function connectToDatabase(configJSON: any, mongoURL: string): Promise<any> {
    const config = new Config(process.env.NODE_ENV, configJSON, '') as {
        storage: {
            mongoUrl: string;
            mongoOpts: any
        },
        QUEUE_USERNAME: string;
        QUEUE_PASSWORD: string;
        QUEUE_HOST: string;
    }

    const storage = DatabaseConnection.createFromConfig(config.storage);

    await wait(5000);

    return storage.models;
}
