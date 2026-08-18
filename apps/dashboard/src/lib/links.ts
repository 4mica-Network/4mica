import { LinkConfig } from "@4mica/url";

/**
 * The app's link builder, seeded from `import.meta.env` rather than from
 * @4mica/url's own lookup.
 *
 * That lookup reads `process.env`, which Vite does not define in the browser
 * bundle, so the package silently falls back to its https://4mica.io defaults —
 * right in production, but in local dev it sends "view public profile" to the
 * live site instead of the playground on :3100. Vite statically replaces the
 * literal `import.meta.env.VITE_*` accesses below, so the values survive the
 * build.
 */
export const links = new LinkConfig({
  VITE_BASE_URL: import.meta.env.VITE_BASE_URL,
  VITE_APP_URL: import.meta.env.VITE_APP_URL,
}).links;
