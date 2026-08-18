/**
 * Handles are public (`4mica.io/<handle>`), so a generated one carries no PII —
 * the user renames it in Settings → Profile if they want something readable.
 *
 * Crockford base32 minus i/l/o/u: 32 divides 256 evenly, so `byte % 32` is
 * unbiased. 8 characters is 40 bits, and the `user-` prefix keeps every
 * generated handle outside `reservedSegments` by construction.
 */

import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const PREFIX = "user-";
const SUFFIX_LENGTH = 8;

export const generateUsername = (): string =>
  PREFIX +
  Array.from(
    randomBytes(SUFFIX_LENGTH),
    (byte) => ALPHABET[byte % ALPHABET.length],
  ).join("");
