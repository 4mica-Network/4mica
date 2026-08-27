import { links } from "@services/links";
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const DISALLOW_PATHS = ["/api/"];

const SITEMAP_PATH = "/sitemap.xml";

const isProductionEnvironment = () => process.env.NODE_ENV === "production";

const getSitemapUrl = () => new URL(SITEMAP_PATH, links.website).toString();

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
    sitemap: getSitemapUrl(),
    host: links.website,
  };
}
