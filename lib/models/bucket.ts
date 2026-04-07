import crypto from "crypto";
import { Schema, Document, Connection, Types } from "mongoose";
import { validate as uuidValidate, version as uuidVersion } from "uuid";
const errors = require("storj-service-error-types");

interface IBucket extends Document {
    storage: number;
    transfer: number;
    status: "Active" | "Inactive";
    pubkeys: string[];
    user: string;
    userId: string;
    name: string;
    maxFrameSize: number;
    created: Date;
    publicPermissions: ("PUSH" | "PULL")[];
    encryptionKey: string;
}

const BucketSchema = new Schema<IBucket>(
    {
        storage: { type: Number, default: 0 },
        transfer: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ["Active", "Inactive"],
            default: "Active",
        },
        pubkeys: [{ type: String, ref: "PublicKey" }],
        user: { type: String, ref: "User" },
        userId: {
            type: String,
            required: true,
            validate: {
                validator: (value: string) =>
                    uuidValidate(value) && uuidVersion(value) === 4,
                message: "Invalid UUID",
            },
            ref: "User",
        },
        name: {
            type: String,
            default: () => "Bucket-" + crypto.randomBytes(3).toString("hex"),
        },
        maxFrameSize: { type: Number, default: -1 },
        created: { type: Date, default: Date.now },
        publicPermissions: {
            type: [{ type: String, enum: ["PUSH", "PULL"] }],
            default: [],
        },
        encryptionKey: { type: String, default: "" },
    },
    {
        statics: {
            async create(
                user: { _id: string; uuid: string },
                data: { pubkeys?: string[]; name?: string },
                callback: (err: Error | null, bucket?: IBucket) => void,
            ) {
                const Bucket = this;

                const bucket = new Bucket({
                    status: "Active",
                    pubkeys: data.pubkeys,
                    user: user._id,
                    userId: user.uuid,
                });

                if (data.name) {
                    bucket.name = data.name;
                }

                try {
                    await bucket.save();

                    const savedBucket = await Bucket.findOne({
                        _id: bucket._id,
                    });
                    if (!savedBucket) {
                        return callback(
                            new errors.InternalError(
                                "Failed to load created bucket",
                            ),
                        );
                    }

                    callback(null, savedBucket);
                } catch (err: any) {
                    if (err.code === 11000) {
                        return callback(
                            new errors.ConflictError(
                                "Name already used by another bucket",
                            ),
                        );
                    }
                    callback(new errors.InternalError(err.message));
                }
            },
        },
    },
);

BucketSchema.index({ user: 1 });
BucketSchema.index({ userId: 1 });
BucketSchema.index({ created: 1 });
BucketSchema.index({ user: 1, name: 1 }, { unique: true });

BucketSchema.set("toObject", {
    transform: (doc: any, ret: Record<string, any>) => {
        delete ret.__v;
        delete ret._id;
        ret.id = doc._id;
    },
});

export = (connection: Connection) =>
    connection.model<IBucket>("Bucket", BucketSchema);
