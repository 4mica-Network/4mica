import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/i18n/en.json";

export const SUPPORTED_LANGUAGES = ["en", "de", "fr", "es"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "4mica.language";

type Catalogue = { default: Record<string, string> };

const CATALOGUES: Record<Exclude<Language, "en">, () => Promise<Catalogue>> = {
  de: () => import("@/i18n/de.json"),
  fr: () => import("@/i18n/fr.json"),
  es: () => import("@/i18n/es.json"),
};

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  supportedLngs: [...SUPPORTED_LANGUAGES],
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export const toLanguage = (value: unknown): Language =>
  SUPPORTED_LANGUAGES.includes(value as Language) ? (value as Language) : "en";

let latestRequest = 0;

export async function applyLanguage(value: unknown): Promise<void> {
  const language = toLanguage(value);
  const request = ++latestRequest;

  if (language !== "en" && !i18n.hasResourceBundle(language, "translation")) {
    const { default: catalogue } = await CATALOGUES[language]();
    i18n.addResourceBundle(language, "translation", catalogue);
  }
  if (request !== latestRequest) {
    return;
  }

  await i18n.changeLanguage(language);
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

if (remembered && remembered !== "en") {
  applyLanguage(remembered).catch(() => {});
}

export default i18n;
