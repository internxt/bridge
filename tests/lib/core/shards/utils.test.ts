import { stub, restore } from "sinon";
import { v4, validate } from "uuid";
import {
    formatShardHash,
    removeUuidFromHash,
} from "../../../../lib/core/shards/utils";
import { Shard } from "../../../../lib/core/shards/Shard";
import fixtures from "../fixtures";

describe("Shard Hash Formatting", () => {
    beforeEach(() => {
        restore();
    });

    describe("removeUuidFromHash", () => {
        it("When hash contains a valid UUID with separator, then it removes the UUID", () => {
            const uuid = v4();
            const originalHash = `${uuid}$actualHash123`;
            const expectedHash = "actualHash123";

            const result = removeUuidFromHash(originalHash);

            expect(result).toEqual(expectedHash);
        });

        it("When hash contains a separator but invalid UUID format, then it returns original hash", () => {
            const notUuid = "not-a-valid-uuid";
            const originalHash = `${notUuid}$actualHash123`;

            const result = removeUuidFromHash(originalHash);

            expect(result).toEqual(originalHash);
        });

        it("When hash does not contain a separator, then it returns original hash", () => {
            const originalHash = "hashWithoutSeparator";

            const result = removeUuidFromHash(originalHash);

            expect(result).toEqual(originalHash);
        });

        it("When hash is empty, then it returns empty string", () => {
            const result = removeUuidFromHash("");

            expect(result).toEqual("");
        });
    });

    describe("formatShardHash", () => {
        it("When shard has hash with UUID, then it returns shard with formatted hash", () => {
            const uuid = v4();
            const originalHash = `${uuid}$actualHash123`;
            const expectedHash = "actualHash123";
            const shard: Shard = {
                ...fixtures.getShard(),
                hash: originalHash,
            };

            const result = formatShardHash(shard);

            expect(result).toEqual({
                ...shard,
                hash: expectedHash,
            });
        });

        it("When shard has no hash, then it returns original shard", () => {
            const shard: Shard = {
                ...fixtures.getShard(),
                hash: undefined as any,
            };

            const result = formatShardHash(shard);

            expect(result).toEqual(shard);
        });
    });
});
