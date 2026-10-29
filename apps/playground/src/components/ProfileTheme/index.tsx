"use client";

import { useLayoutEffect } from "react";
import {
  applyTheme,
  preferenceScript,
  resolveTheme,
  storedTheme,
  type ThemePreference,
  watchSystemTheme,
} from "@/lib/theme";

export function ProfileTheme({ preference }: { preference: ThemePreference }) {
  useLayoutEffect(() => {
    const apply = () => applyTheme(resolveTheme(preference));
    apply();
    const unwatch = preference === "system" ? watchSystemTheme(apply) : null;

    return () => {
      unwatch?.();
      applyTheme(storedTheme());
    };
  }, [preference]);

  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static script built from a validated three-value preference, no user text.
      dangerouslySetInnerHTML={{ __html: preferenceScript(preference) }}
      suppressHydrationWarning
    />
  );
}
