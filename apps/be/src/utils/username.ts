/**
 * Handles are public (`4mica.io/<handle>`), so a generated one carries no PII —
 * the user renames it in Settings → Profile if they want something readable.
 *
 * Crockford base32 minus i/l/o/u: 32 divides 256 evenly, so `byte % 32` is
 * unbiased. 8 characters is 40 bits, and the `user-` prefix keeps every
 * generated handle outside `reservedSegments` by construction.
 *
 * The alphabet, prefix and length come from @4mica/url, which also exports the
 * `isGeneratedUsername` detector built from them — so the minter and the
 * detector cannot drift apart.
 */

import { randomBytes } from "node:crypto";
import {
  GENERATED_USERNAME_ALPHABET as ALPHABET,
  GENERATED_USERNAME_PREFIX as PREFIX,
  GENERATED_USERNAME_SUFFIX_LENGTH as SUFFIX_LENGTH,
} from "@4mica/url";

export const generateUsername = (): string =>
  PREFIX +
  Array.from(
    randomBytes(SUFFIX_LENGTH),
    (byte) => ALPHABET[byte % ALPHABET.length],
  ).join("");
