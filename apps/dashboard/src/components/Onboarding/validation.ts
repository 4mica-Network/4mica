import { isValidUsername, usernameUnavailableReason } from "@4mica/url";
import type { UsernameStatus } from "@stores/user/type";

/**
 * Client-side gating for the wizard's Continue button.
 *
 * These mirror the server's valibot schemas rather than replacing them — the
 * API is still the authority, and its `issues[]` are what render under the
 * fields. Their only job is to stop the user submitting something that is
 * obviously going to bounce.
 *
 * Kept as pure functions in their own module because the dashboard's vitest
 * runs in `node` with `include: ["src/**\/*.test.ts"]` — no jsdom, no `.tsx`,
 * so this is the layer that can actually be tested.
 */

/** Matches `trimmed(120)` plus a minimum, on PATCH /me/profile. */
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 120;

export const isNameValid = (name: string): boolean => {
  const trimmed = name.trim();
  return trimmed.length >= NAME_MIN_LENGTH && trimmed.length <= NAME_MAX_LENGTH;
};

/** Format and namespace only — availability is the server's answer to give. */
export const isUsernameShapeValid = (username: string): boolean => {
  const candidate = username.trim().toLowerCase();
  return (
    isValidUsername(candidate) && usernameUnavailableReason(candidate) === null
  );
};

/**
 * `error` and `idle` deliberately pass. The probe is advisory: if it is
 * rate-limited or the network blips, the write still decides, and blocking
 * Continue on a failed probe would strand the user in the wizard.
 */
export const isUsernameValid = (
  username: string,
  status: UsernameStatus,
): boolean =>
  isUsernameShapeValid(username) &&
  status !== "checking" &&
  status !== "taken" &&
  status !== "reserved" &&
  status !== "blacklisted";

/** Only `legalName` is required; the rest is refined later in Settings. */
export const isBusinessValid = (legalName: string): boolean =>
  legalName.trim().length > 0;
