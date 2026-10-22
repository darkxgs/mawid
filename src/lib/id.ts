import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijkmnopqrstuvwxyz";
const short = customAlphabet(alphabet, 14);
const long = customAlphabet(alphabet + "ABCDEFGHJKLMNPQRSTUVWXYZ", 32);

/** Prefixed, URL-safe ids: `bk_7h2k...`. The prefix makes logs readable. */
export const newId = (prefix: string) => `${prefix}_${short()}`;

/** Unguessable token for customer self-service links. */
export const newToken = () => long();
