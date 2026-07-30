import { links } from "@services/links";
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/**
 * Crawl rules. The site is a fully static export, so there is nothing private
 * to hide — the only Disallow is the (non-existent) `/api` prefix kept as a
 * guard for future routes. `/_next` is deliberately NOT disallowed: Google
 * needs the CSS and JS bundles to render the page, and blocking them degrades
 * how the page is understood and ranked.
 */
const DISALLOW_PATHS = ["/api/"];

const SITEMAP_PATH = "/sitemap.xml";

const isProductionEnvironment = () => process.env.NODE_ENV === "production";

const getSitemapUrl = () => new URL(SITEMAP_PATH, links.website).toString();

export default function robots(): MetadataRoute.Robots {
  // Preview and local builds must never be indexed.
  if (!isProductionEnvironment()) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW_PATHS,
      },
    ],
    sitemap: getSitemapUrl(),
    host: links.website,
  };
}
