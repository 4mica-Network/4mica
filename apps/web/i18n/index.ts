export { type EnglishMessages, en } from "./locales/en/index";
export { defaultLocale, locales, messages, resources } from "./resources";

export function t(key: string, options?: Record<string, unknown>) {
  if (options) {
    return key.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      String(options[name] ?? ""),
    );
  }

  return key;
}
