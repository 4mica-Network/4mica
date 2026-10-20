export { messages } from "./resources";

export function t(key: string, options?: Record<string, unknown>): string {
  if (!options) {
    return key;
  }

  return key.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(options[name] ?? ""),
  );
}
