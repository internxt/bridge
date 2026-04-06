"use strict";

import { Request, RequestHandler } from "express";
import { BadRequestError } from "../error-types";
import * as crypto from "crypto";
import * as secp256k1 from "secp256k1";

const THRESHOLD = 300000;

export function isHexString(a: unknown): boolean {
    if (typeof a !== "string") {
        return false;
    }
    return /^([0-9a-fA-F]{2})+$/.test(a);
}

export function getSigHash(req: Request): Buffer {
    const hasher = crypto.createHash("sha256");
    const timestamp = req.headers["x-node-timestamp"] as string;
    let proto = req.protocol;
    if (req.headers["x-forwarded-proto"]) {
        proto = req.headers["x-forwarded-proto"] as string;
    }
    const url = proto + "://" + req.get("host") + req.originalUrl;
    hasher.update(req.method);
    hasher.update(url);
    hasher.update(timestamp);
    hasher.update((req as any).rawbody);

    return hasher.digest();
}

export function checkSig(req: Request): boolean {
    const sighash = getSigHash(req);
    const sigstr = req.headers["x-node-signature"] as string;
    if (!isHexString(sigstr)) {
        return false;
    }
    const buf = Uint8Array.from(Buffer.from(sigstr, "hex"));
    const sig = secp256k1.signatureImport(buf);
    const pubkey = Uint8Array.from(Buffer.from(req.headers["x-node-pubkey"] as string, "hex"));

    return secp256k1.ecdsaVerify(sig, sighash, pubkey);
}

export function checkPubkey(pubkey: unknown): boolean {
    if (!isHexString(pubkey)) {
        return false;
    }
    const buf = Uint8Array.from(Buffer.from(pubkey as string, "hex"));
    return secp256k1.publicKeyVerify(buf);
}

export function checkTimestamp(ts: unknown): boolean {
    const timestamp = parseInt(ts as string);
    if (!Number.isSafeInteger(timestamp)) {
        return false;
    }
    const now = Date.now();
    if (timestamp < now - THRESHOLD || timestamp > now + THRESHOLD) {
        return false;
    }
    return true;
}

export function checkNodeID(nodeID: unknown, pubkey: unknown): boolean {
    if (!nodeID || (nodeID as string).length !== 40 || !isHexString(nodeID)) {
        return false;
    }
    const sha256 = crypto.createHash("sha256");
    const ripemd160 = crypto.createHash("ripemd160");
    sha256.update(Uint8Array.from(Buffer.from(pubkey as string, "hex")));
    ripemd160.update(Uint8Array.from(sha256.digest()));
    if (ripemd160.digest("hex") !== nodeID) {
        return false;
    }
    return true;
}

export const authFarmer: RequestHandler = (req, res, next) => {
    const nodeID = req.headers["x-node-id"] as string;
    const timestamp = req.headers["x-node-timestamp"] as string;
    const pubkey = req.headers["x-node-pubkey"] as string;

    if (!checkTimestamp(timestamp)) {
        return next(BadRequestError("Invalid timestamp header"));
    }

    if (!checkPubkey(pubkey)) {
        return next(BadRequestError("Invalid pubkey header"));
    }

    if (!checkNodeID(nodeID, pubkey)) {
        return next(BadRequestError("Invalid nodeID header"));
    }

    if (!(req as any).rawbody || !Buffer.isBuffer((req as any).rawbody)) {
        return next(BadRequestError("Invalid body"));
    }

    if (!checkSig(req)) {
        return next(BadRequestError("Invalid signature header"));
    }

    next();
};
