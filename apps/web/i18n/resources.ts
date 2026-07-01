import { en } from "./locales/en/index";

export const defaultLocale = "en";
export const locales = [defaultLocale] as const;

export const resources = {
  en: {
    translation: en,
  },
} as const;

export const messages = en;
