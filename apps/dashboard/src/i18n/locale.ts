import i18next from "i18next";

export const currentLocale = (): string => i18next.resolvedLanguage ?? "en";
