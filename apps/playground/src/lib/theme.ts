export type Theme = "dark" | "light";
export type ThemePreference = Theme | "system";

export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME: Theme = "dark";

export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t="${DEFAULT_THEME}";}var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.style.colorScheme=t;}catch(e){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}})();`;

const DARK_QUERY = "(prefers-color-scheme: dark)";

export const toThemePreference = (value: unknown): ThemePreference =>
  value === "light" || value === "system" ? value : "dark";

export const resolveTheme = (preference: ThemePreference): Theme =>
  preference === "system"
    ? window.matchMedia(DARK_QUERY).matches
      ? "dark"
      : "light"
    : preference;

export const storedTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

export const preferenceScript = (preference: ThemePreference) =>
  `(function(){var p=${JSON.stringify(toThemePreference(preference))};var d=p==="system"?window.matchMedia("${DARK_QUERY}").matches:p!=="light";var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";})();`;

export const watchSystemTheme = (onChange: () => void): (() => void) => {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}
