import type { SecuritySettings } from "@stores/security/type";
import {
  allowlistError,
  formatAllowlist,
  parseAllowlist,
} from "@utils/ipAllowlist";

export interface PoliciesDraft {
  requireMfa: boolean;
  sessionMaxAgeHours: string;
  reauthWindowMinutes: string;
  ipAllowlist: string;
  enforceIpAllowlistForApiKeys: boolean;
}

export type PoliciesErrors = Partial<Record<keyof PoliciesDraft, string>>;

type T = (key: string, options?: Record<string, unknown>) => string;

export const draftFromSecurity = (
  settings: SecuritySettings,
): PoliciesDraft => ({
  requireMfa: settings.requireMfa,
  sessionMaxAgeHours:
    settings.sessionMaxAgeHours === null
      ? ""
      : String(settings.sessionMaxAgeHours),
  reauthWindowMinutes: String(settings.reauthWindowMinutes),
  ipAllowlist: formatAllowlist(settings.ipAllowlist),
  enforceIpAllowlistForApiKeys: settings.enforceIpAllowlistForApiKeys,
});

const intIn = (raw: string, min: number, max: number) => {
  const value = Number(raw.trim());
  return (
    raw.trim() !== "" && Number.isInteger(value) && value >= min && value <= max
  );
};

export const validatePolicies = (
  draft: PoliciesDraft,
  t: T,
): PoliciesErrors => {
  const errors: PoliciesErrors = {};
  if (
    draft.sessionMaxAgeHours.trim() &&
    !intIn(draft.sessionMaxAgeHours, 1, 720)
  ) {
    errors.sessionMaxAgeHours = t("security.policies.errors.sessionMaxAge");
  }
  if (!intIn(draft.reauthWindowMinutes, 1, 240)) {
    errors.reauthWindowMinutes = t("security.policies.errors.reauthWindow");
  }
  const allowlist = allowlistError(parseAllowlist(draft.ipAllowlist), t);
  if (allowlist) {
    errors.ipAllowlist = allowlist;
  }
  return errors;
};

export const toSecuritySettings = (draft: PoliciesDraft): SecuritySettings => ({
  requireMfa: draft.requireMfa,
  sessionMaxAgeHours: draft.sessionMaxAgeHours.trim()
    ? Number(draft.sessionMaxAgeHours)
    : null,
  reauthWindowMinutes: Number(draft.reauthWindowMinutes),
  ipAllowlist: parseAllowlist(draft.ipAllowlist),
  enforceIpAllowlistForApiKeys: draft.enforceIpAllowlistForApiKeys,
});

export const withEntry = (raw: string, entry: string): string => {
  const entries = parseAllowlist(raw);
  return formatAllowlist(
    entries.includes(entry) ? entries : [...entries, entry],
  );
};
