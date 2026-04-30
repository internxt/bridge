import assert from "assert";
import { Schema, Document, Connection } from "mongoose";
import { validate as uuidValidate, version as uuidVersion } from "uuid";

interface IContract {
    version: number;
    store_begin: Date;
    farmer_id: string;
    data_size: number;
}

interface IUploadContract {
    nodeID: string;
    contract: IContract;
}

interface IUpload extends Document {
    uuid: string;
    index: number;
    data_size: number;
    uploadId?: string;
    contracts: IUploadContract[];
    _validate(): void;
}

const UploadSchema = new Schema<IUpload>({
    uuid: {
        type: String,
        required: true,
        validate: {
            validator: (value: string) =>
                uuidValidate(value) && uuidVersion(value) === 4,
            message: "Invalid UUID",
        },
    },
    index: { type: Number, required: true },
    data_size: { type: Number, required: true },
    uploadId: { type: String },
    contracts: [
        {
            _id: false,
            nodeID: String,
            contract: {
                version: Number,
                store_begin: { type: Date, default: Date.now },
                farmer_id: String,
                data_size: Number,
            },
        },
    ],
});

UploadSchema.index({ uuid: 1 });

UploadSchema.set("toObject", {
    transform: (doc: any, ret: Record<string, any>) => {
        delete ret.__v;
        delete ret._id;
        ret.id = doc._id;
    },
});

export = (connection: Connection) =>
    connection.model<IUpload>("Upload", UploadSchema);
