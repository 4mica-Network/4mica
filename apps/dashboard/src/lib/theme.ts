export type Theme = "dark" | "light";
export type ThemePreference = Theme | "system";

export const THEME_STORAGE_KEY = "4mica.appTheme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export const toThemePreference = (value: unknown): ThemePreference =>
  value === "light" || value === "system" ? value : "dark";

export const resolveTheme = (preference: ThemePreference): Theme =>
  preference === "system"
    ? window.matchMedia(DARK_QUERY).matches
      ? "dark"
      : "light"
    : preference;

export const applyTheme = (theme: Theme): void => {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
};

export const rememberThemePreference = (preference: ThemePreference): void => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {}
};

export const watchSystemTheme = (onChange: () => void): (() => void) => {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
