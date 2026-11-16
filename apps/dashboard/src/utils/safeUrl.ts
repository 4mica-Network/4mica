import { isHttpsUrl } from "@4mica/rules";

export const safeExternalUrl = (value: unknown): string | null =>
  typeof value === "string" && isHttpsUrl(value) ? value : null;
