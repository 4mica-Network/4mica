"use client";

import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { i18next } from "./i18next";

export default function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>;
}
