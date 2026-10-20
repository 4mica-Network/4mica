import { links } from "@services/links";
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const DISALLOW_PATHS = ["/api/"];

const SITEMAP_PATHS = ["/sitemap.xml", "/sitemap-profiles.xml"];

const isProductionEnvironment = () => process.env.NODE_ENV === "production";

const getSitemapUrls = () =>
  SITEMAP_PATHS.map((path) => new URL(path, links.website).toString());

export default function robots(): MetadataRoute.Robots {
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
    sitemap: getSitemapUrls(),
    host: links.website,
  };
}
