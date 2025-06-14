import { config as loadEnv } from 'dotenv';
import mongoose, { Connection, Model } from 'mongoose';

export class StorageDbManager {
    connection: Connection | null = null;
    models: Models = {} as Models;

    async connect(): Promise<void> {
        loadEnv();

        const url = process.env.inxtbridge_storage__mongoUrl;
        const user = process.env.inxtbridge_storage__mongoOpts__user;
        const password = process.env.inxtbridge_storage__mongoOpts__pass;
        const dbName = process.env.inxtbridge_storage__mongoOpts__dbName;

        if (!url || !user || !password || !dbName) {
            throw new Error('Missing database configuration');
        }

        if (!url.includes('test') || !dbName.includes('test')) {
            throw new Error("Test database must include 'test' in name");
        }

        const baseUrl = new URL(url);
        const mongooseInstance = await mongoose.connect(
            baseUrl.toString().replace(baseUrl.pathname, ''),
            {
                dbName: dbName,
                auth: {
                    username: user,
                    password: password
                }
            }
        );

        this.connection = mongooseInstance.connection;

        const modelFactories = require('storj-service-storage-models/lib/models');

        Object.keys(modelFactories).forEach(modelName => {
            if (!this.models) {
                this.models = {} as Models;
            }

            (this.models as any)[modelName] = modelFactories[modelName](this.connection);
        });
    }

    async disconnect(): Promise<void> {
        if (this.connection) {
            await mongoose.disconnect();
            this.connection = null;
            this.models = {} as Models;
        }
    }
}

interface Models {
    Bucket: Model<any>;
    PublicKey: Model<any>;
    User: Model<any>;
    UserNonce: Model<any>;
    Token: Model<any>;
    Contact: Model<any>;
    BucketEntry: Model<any>;
    Frame: Model<any>;
    Pointer: Model<any>;
    Shard: Model<any>;
    Credit: Model<any>;
    Debit: Model<any>;
    Mirror: Model<any>;
    ExchangeReport: Model<any>;
    PaymentProcessor: Model<any>;
    FullAudit: Model<any>;
    Marketing: Model<any>;
    Referral: Model<any>;
    StorageEvent: Model<any>;
    Partner: Model<any>;
    Upload: Model<any>;
    BucketEntryShard: Model<any>;
}
