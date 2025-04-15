import { validate } from "uuid";
import { Shard } from "./Shard";

export const formatShardHash = (shard: Shard): Shard => {
    if (shard.hash) {
        return { ...shard, hash: removeUuidFromHash(shard.hash) };
    }
    return shard;
};

export const removeUuidFromHash = (hash: string): string => {
    const separatorIndex = hash.indexOf("$");
    if (separatorIndex !== -1) {
        const potentialUuid = hash.slice(0, separatorIndex);

        if (validate(potentialUuid)) {
            return hash.slice(separatorIndex + 1);
        }
    }
    return hash;
};
