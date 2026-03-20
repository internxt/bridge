import semver from "semver";
import { getContext } from "../../../requestContext";

const EXEMPT_CLIENTS: Record<string, string> = {
    "internxt-cli": "1.6.3",
    "drive-desktop-windows": "2.6.6",
    // All versions
    "drive-desktop-linux": '*',
};

export function shouldEnforceUploadValidation(): boolean {
    const { clientId, version } = getContext();
    if (!clientId || !version) return true;
    if (!(clientId in EXEMPT_CLIENTS)) return true;

    const maxExemptVersion = EXEMPT_CLIENTS[clientId];
    const coerced = semver.coerce(version) ?? version;
    return !semver.satisfies(coerced, `<=${maxExemptVersion}`);
}
