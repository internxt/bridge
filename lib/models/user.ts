import crypto from "crypto";
import { Schema, Document, Connection, Types } from "mongoose";
import {
    v4 as uuidv4,
    validate as uuidValidate,
    version as uuidVersion,
} from "uuid";

const errors = require("storj-service-error-types");
const activator = require("hat").rack(256);
// NB: emails must conform to RFC 3969 (https://tools.ietf.org/html/rfc3696)
const isValidEmail = (email: string): boolean =>
    /^(.{1,64}@.{1,255}|.{1,255}@heroku\.storj\.io)$/.test(email);

interface IBytesTracker {
    lastHourStarted?: Date;
    lastHourBytes: number;
    lastDayStarted?: Date;
    lastDayBytes: number;
    lastMonthStarted?: Date;
    lastMonthBytes: number;
}

interface IUser extends Document {
    _id: string;
    uuid: string;
    email: string;
    hashpass: string | null;
    pendingHashPass: string | null;
    created: Date;
    activator: unknown;
    deactivator: unknown;
    resetter: unknown;
    activated: boolean;
    isFreeTier: boolean;
    preferences: { dnt: boolean };
    configuration: {
        disableDeactivation: boolean;
        disableResetPassword: boolean;
        disableBucketDeletion: boolean;
    };
    totalUsedSpaceBytes: number;
    maxSpaceBytes: number;
    activate(callback: (err?: Error) => void): Promise<void>;
    deactivate(callback: (err?: Error) => void): Promise<void>;
}

const UserSchema = new Schema<IUser>(
    {
        _id: {
            type: String,
            required: true,
            default: () => uuidv4(),
            validate: {
                validator: (value: string) =>
                    (uuidValidate(value) && uuidVersion(value) === 4) ||
                    isValidEmail(value),
                message: "Invalid UUID",
            },
        },
        uuid: {
            type: String,
            required: true,
            default: () => uuidv4(),
            validate: {
                validator: (value: string) =>
                    uuidValidate(value) && uuidVersion(value) === 4,
                message: "Invalid UUID",
            },
        },
        email: {
            type: String,
            required: true,
            validate: {
                validator: (value: string) => isValidEmail(value),
                message: "Invalid user email address",
            },
        },
        hashpass: {
            type: String,
            validate: {
                validator: (value: string | null) =>
                    value === null ? true : value.length === 64,
                message:
                    "{VALUE} must either be 64 characters in length or null",
            },
        },
        pendingHashPass: { type: String, default: null },
        created: { type: Date, default: Date.now },
        activator: { type: Schema.Types.Mixed, default: activator },
        deactivator: { type: Schema.Types.Mixed, default: null },
        resetter: { type: Schema.Types.Mixed, default: null },
        activated: { type: Boolean, default: false },
        isFreeTier: { type: Boolean, default: true },
        preferences: {
            dnt: { type: Boolean, default: false, required: true },
        },
        totalUsedSpaceBytes: { type: Number, default: 0 },
        maxSpaceBytes: { type: Number, default: 0 },
    },
    {
        statics: {
            // TODO: The model is enforcing domain and bussiness logic, move this to a usecase or service at least the validation part.
            async lookup(email: string, passwd: string): Promise<IUser> {
                const User = this;
                if (!passwd) {
                    throw new errors.NotAuthorizedError("Invalid email or password");
                }

                const user = await User.findOne({
                    email,
                    hashpass: crypto
                        .createHash("sha256")
                        .update(passwd)
                        .digest("hex"),
                });

                if (!user) {
                    throw new errors.NotAuthorizedError("Invalid email or password");
                }

                return user;
            },
            // TODO: The model is enforcing domain and bussiness logic, move this to a usecase or service at least the validation part.
            async create(opts: {
                email: string;
                password: string;
                maxSpaceBytes: number;
                activated: boolean;
            }): Promise<IUser> {
                const User = this;

                if (!opts.email) {
                    throw new errors.BadRequestError("Must supply an email");
                }

                if (
                    !opts.password ||
                    Buffer.from(opts.password, "hex").length * 8 !== 256
                ) {
                    throw new errors.BadRequestError(
                        "Password must be hex encoded SHA-256 hash",
                    );
                }

                if (!isValidEmail(opts.email)) {
                    throw new errors.BadRequestError("Invalid email");
                }

                const existing = await User.findOne({ email: opts.email });
                if (existing) {
                    throw new errors.BadRequestError("Email address already registered");
                }

                const userUuid = uuidv4();
                const user = new User({
                    _id: userUuid,
                    uuid: userUuid,
                    email: opts.email,
                    hashpass: crypto
                        .createHash("sha256")
                        .update(opts.password)
                        .digest("hex"),
                    maxSpaceBytes: opts.maxSpaceBytes,
                    activated: opts.activated,
                });

                await user.save();
                return user;
            },
        },
    },
);

UserSchema.index({ resetter: 1 });

UserSchema.set("toJSON", {
    virtuals: true,
    transform: (doc: any, ret: Record<string, any>) => {
        delete ret.__v;
        delete ret._id;
        delete ret.pendingHashPass;
        delete ret.bytesDownloaded;
        delete ret.bytesUploaded;
    },
});

UserSchema.set("toObject", {
    virtuals: true,
    transform: (doc: any, ret: Record<string, any>) => {
        delete ret.__v;
        delete ret._id;
        delete ret.pendingHashPass;
        delete ret.bytesDownloaded;
        delete ret.bytesUploaded;
    },
});

export = (connection: Connection) =>
    connection.model<IUser>("User", UserSchema);
