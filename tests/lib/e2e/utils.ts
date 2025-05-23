import { Method } from "axios";
import bitcore from "bitcore-lib";
import { createHash, scrypt } from "crypto";

import secp256k1 from "secp256k1";
import { engine, intervalRefs } from "./setup";
import { TestUser, testUser, User } from "./users.fixtures";

type Args = { storage?: any; user?: TestUser };

const createdUsers: User[] = [];
export const createTestUser = async (args: Args = {}): Promise<User> => {
    const { storage = engine.storage, user = testUser } = args;

    const payload = { email: user.email, password: user.password };
    const createdUser: User = await new Promise((resolve, reject) =>
        storage.models.User.create(payload, (err: Error, user: any) => {
            err ? reject(err) : resolve(user.toObject());
        })
    );

    await storage.models.User.updateOne(
        { _id: createdUser.uuid },
        { maxSpaceBytes: user.maxSpaceBytes, activated: true }
    );

    createdUser.password = user.password;

    createdUsers.push(createdUser);

    return createdUser;
};

export const cleanUpTestUsers = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        engine.storage.models.User.deleteMany(
            { email: { $in: [createdUsers.map((user) => user.email)] } },
            (err: Error) => {
                err ? reject(err) : resolve();
            }
        );
    });
};

export const deleteTestUser = (args: Args = {}): Promise<void> => {
    const { storage = engine.storage, user = testUser } = args;
    return new Promise((resolve, reject) =>
        storage.models.User.deleteOne({ email: user.email }, (err: Error) => {
            err ? reject(err) : resolve();
        })
    );
};

export const getAuth = (user: Omit<TestUser, "maxSpaceBytes"> = testUser) => {
    const credential = Buffer.from(`${user.email}:${user.password}`).toString(
        "base64"
    );
    return `Basic ${credential}`;
};

export const shutdownEngine = async () => {
    await Promise.all([
        engine.storage.connection.close(),
        engine.networkQueue.close(),
        engine.redis.quit(),
        engine.server.server.close(),
    ]);
    intervalRefs.forEach((ref) => clearInterval(ref));
};

export function getSignHash(
    bridgeUrl: string,
    method: string,
    path: string,
    timestamp: number,
    rawbody: any
) {
    const hasher = createHash("sha256");
    hasher.update(method);
    hasher.update(bridgeUrl + path);
    hasher.update(timestamp.toString());
    hasher.update(rawbody);

    return hasher.digest();
}

export function getFarmerBridgeRequestObject(
    keyPair: KeyPair,
    bridgeUrl: string,
    method: Method,
    path: string,
    headers: any,
    body: any
) {
    if (!headers) {
        headers = [];
    }

    const urlObj = new URL(bridgeUrl + path);

    const timestamp = Date.now();
    const rawbody = JSON.stringify(body);
    const sighash = getSignHash(bridgeUrl, method, path, timestamp, rawbody);

    const privkey = Buffer.from(keyPair.getPrivateKeyPadded(), "hex");
    const sigObj = secp256k1.ecdsaSign(sighash, privkey);
    const sig = Buffer.from(
        secp256k1.signatureExport(sigObj.signature)
    ).toString("hex");

    headers["x-node-timestamp"] = timestamp;
    headers["x-node-id"] = keyPair.getNodeID();
    headers["x-node-signature"] = sig;
    headers["x-node-pubkey"] = keyPair.getPublicKey();
    headers["content-type"] = "application/json";
    headers["content-length"] = Buffer.byteLength(rawbody);

    return { method, data: body, headers, url: urlObj.toString() };
}

export default class KeyPair {
    _privkey: any;
    _pubkey: any;

    constructor(privkey?: string) {
        this._privkey = privkey
            ? new bitcore.PrivateKey(privkey)
            : new bitcore.PrivateKey();

        this._pubkey = this._privkey.toPublicKey();
    }

    getPrivateKey() {
        return this._privkey.toString();
    }

    getPrivateKeyPadded() {
        const privKey: any = this._privkey;

        return privKey.bn.toBuffer({ size: 32 }).toString("hex");
    }

    getPublicKey() {
        return this._pubkey.toString();
    }

    getNodeID() {
        return bitcore.crypto.Hash.sha256ripemd160(
            this._pubkey.toBuffer()
        ).toString("hex");
    }

    getAddress() {
        return new bitcore.Address(
            Buffer.from(this.getNodeID(), "hex")
        ).toString();
    }

    sign(message: Buffer, options: any) {
        let sign = null;
        let signobj = null;
        const opts = { compact: true, ...options };

        if (opts.compact) {
            const hash = new bitcore.Message(message.toString()).magicHash();
            signobj = secp256k1.ecdsaSign(
                hash,
                Buffer.from(this.getPrivateKeyPadded(), "hex")
            );
            const der: any = bitcore.crypto.Signature.fromDER(
                Buffer.from(secp256k1.signatureExport(signobj.signature))
            );
            sign = der
                .toCompact(signobj.recid, this._pubkey.compressed)
                .toString("base64");
        } else {
            const hash = createHash("sha256").update(message).digest();
            signobj = secp256k1.ecdsaSign(
                hash,
                Buffer.from(this.getPrivateKeyPadded(), "hex")
            );
            sign = Buffer.from(
                secp256k1.signatureExport(signobj.signature)
            ).toString("hex");
        }

        return sign;
    }
}

export async function getProofOfWork(
    challenge: string,
    target: string,
    nonce = 0
) {
    const scryptOpts = { N: Math.pow(2, 10), r: 1, p: 1 };

    const salt = Buffer.alloc(8, 0);
    salt.writeDoubleBE(nonce);

    return new Promise((resolve, reject) => {
        scrypt(challenge, salt, 32, scryptOpts, (err, result) => {
            if (err) {
                return reject(err);
            }

            if (result.toString("hex").localeCompare(target) < 0) {
                return resolve(nonce);
            }

            return getProofOfWork(challenge, target, nonce + 1);
        });
    });
}
