import { LinkConfig } from "@4mica/url";
import { publicEnv } from "@/env";

/**
 * The app's link builder, seeded from `publicEnv` rather than from @4mica/url's
 * own `process.env` lookup.
 *
 * That lookup reads through a variable (`env.NEXT_PUBLIC_BASE_URL`), which Next
 * does not rewrite, so in a client component it comes back undefined and the
 * package silently falls back to its https://4mica.io defaults — while the
 * server, which has a real `process.env`, uses the configured values. Any client
 * component rendering a link then hydrates with a different href than the HTML
 * it is hydrating. `publicEnv` does the literal member accesses Next inlines, so
 * both sides agree.
 */
export const links = new LinkConfig({
  NEXT_PUBLIC_BASE_URL: publicEnv.NEXT_PUBLIC_BASE_URL,
  NEXT_PUBLIC_APP_URL: publicEnv.NEXT_PUBLIC_APP_URL,
}).links;
