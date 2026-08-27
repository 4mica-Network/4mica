import { en } from "./locales/en/index";

/**
 * A single locale today. Adding one means turning `messages` into a lookup
 * keyed by locale; the typed-object shape is what makes that a compile-time
 * change rather than a runtime lookup that can silently miss.
 */
export const messages = en;
