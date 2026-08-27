export { messages } from "./resources";

/**
 * Interpolation over an already-resolved string, matching apps/web's helper.
 * Messages are reached through the typed `messages` object, so this is not a
 * key lookup and a missing key is a compile error rather than a runtime blank.
 */
export function t(key: string, options?: Record<string, unknown>): string {
  if (!options) {
    return key;
  }

  return key.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(options[name] ?? ""),
  );
}
