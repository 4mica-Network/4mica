"use client";

import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { defaultLocale, resources } from "./resources";

if (!i18next.isInitialized) {
  i18next.use(initReactI18next).init({
    fallbackLng: defaultLocale,
    interpolation: {
      escapeValue: false,
    },
    lng: defaultLocale,
    resources,
  });
}

export { i18next };
