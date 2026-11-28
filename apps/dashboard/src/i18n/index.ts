import {
  createCollectionRegistry,
  loadersFromGlob,
  withCollections,
} from "@4mica/i18n";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import core from "@/i18n/locales/en/core.json";

export const SUPPORTED_LANGUAGES = ["en", "de", "fr", "es"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const COLLECTIONS = [
  "core",
  "overview",
  "payments",
  "wallet",
  "customers",
  "agents",
  "apis",
  "resource",
  "developer",
  "help",
  "settings",
  "compliance",
  "onboarding",
  "checklist",
  "finance",
  "security",
] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const LANGUAGE_STORAGE_KEY = "4mica.language";

i18n.use(initReactI18next).init({
  resources: {},
  partialBundledLanguages: true,
  lng: "en",
  fallbackLng: false,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false, bindI18nStore: "added" },
});

export const translations = createCollectionRegistry<Collection, Language>({
  i18n,
  languages: SUPPORTED_LANGUAGES,
  collections: COLLECTIONS,
  loaderFor: loadersFromGlob(
    import.meta.glob(["./locales/*/*.json", "!./locales/en/core.json"]),
  ),
  bundled: { en: { core } },
});

export const withTranslations = <Value>(
  load: () => Promise<Value>,
  collections: readonly Collection[],
) => withCollections(translations, load, collections);

export const toLanguage = (value: unknown): Language =>
  translations.isLanguage(value) ? value : "en";

export async function applyLanguage(value: unknown): Promise<void> {
  const language = toLanguage(value);
  const applied = await translations.changeLanguage(language);
  if (!applied) {
    return;
  }
  document.documentElement.lang = language;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {}
}

const remembered = (() => {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
})();

export const languageReady: Promise<void> =
  remembered && remembered !== "en"
    ? applyLanguage(remembered).catch(() => {})
    : Promise.resolve();

export default i18n;
