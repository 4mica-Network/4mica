import { normalizeIpEntry } from "@utils/ip-allowlist";
import * as v from "valibot";

export const IP_ALLOWLIST_MAX = 100;
export const SESSION_MAX_AGE_HOURS_MAX = 720;
export const REAUTH_WINDOW_MINUTES_MAX = 240;

const integerBetween = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

export const IpAllowlistSchema = v.pipe(
  v.array(
    v.pipe(
      v.string(),
      v.trim(),
      v.maxLength(64),
      v.check(
        (entry) => normalizeIpEntry(entry) !== null,
        "must be an IPv4 or IPv6 address or CIDR range",
      ),
    ),
  ),
  v.maxLength(IP_ALLOWLIST_MAX),
  v.transform((entries) => [
    ...new Set(entries.map((entry) => normalizeIpEntry(entry) ?? entry)),
  ]),
);

export const UpdateSecuritySettingsSchema = v.object({
  requireMfa: v.optional(v.boolean()),
  sessionMaxAgeHours: v.optional(
    v.nullable(integerBetween(1, SESSION_MAX_AGE_HOURS_MAX)),
  ),
  reauthWindowMinutes: v.optional(integerBetween(1, REAUTH_WINDOW_MINUTES_MAX)),
  ipAllowlist: v.optional(IpAllowlistSchema),
  enforceIpAllowlistForApiKeys: v.optional(v.boolean()),
});
