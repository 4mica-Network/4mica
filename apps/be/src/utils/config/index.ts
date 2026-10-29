import { createHash } from "node:crypto";
import { PAYMENT_NETWORK_IDS } from "@4mica/rules";
import {
  CUSTOMER_BASES,
  FUNDS_SOURCES,
  MONTHLY_VOLUMES,
  OWNER_ROLES,
} from "@controllers/compliance/schema";
import {
  BUSINESS_TYPES,
  DEFAULT_HOMES,
  LANGUAGES,
  NOTIFICATION_PLACEMENTS,
  THEMES,
} from "@controllers/me/schema";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
} from "@controllers/support/schema";
import { buildCountries } from "./countries";
import { buildCityTimezones } from "./timezones";

export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AUD",
  "CAD",
] as const;

export const CONFIG_TTL_MS = 24 * 60 * 60 * 1000;

const buildLists = () => ({
  countries: buildCountries(),
  timezones: buildCityTimezones(),
  currencies: CURRENCIES,
  languages: LANGUAGES,
  themes: THEMES,
  homes: DEFAULT_HOMES,
  notificationPlacements: NOTIFICATION_PLACEMENTS,
  businessTypes: BUSINESS_TYPES,
  monthlyVolumes: MONTHLY_VOLUMES,
  customerBases: CUSTOMER_BASES,
  fundsSources: FUNDS_SOURCES,
  ownerRoles: OWNER_ROLES,
  networks: PAYMENT_NETWORK_IDS,
  supportCategories: SUPPORT_CATEGORIES,
  supportPriorities: SUPPORT_PRIORITIES,
});

export type AppConfig = ReturnType<typeof buildLists> & { version: string };

export const buildConfig = (): AppConfig => {
  const lists = buildLists();
  const version = createHash("sha1")
    .update(JSON.stringify(lists))
    .digest("hex");
  return { version, ...lists };
};

let cached: { config: AppConfig; expiresAt: number } | null = null;

export const getConfig = (now = Date.now()): AppConfig => {
  if (!cached || cached.expiresAt <= now) {
    cached = { config: buildConfig(), expiresAt: now + CONFIG_TTL_MS };
  }
  return cached.config;
};

export const clearConfigCache = (): void => {
  cached = null;
};
