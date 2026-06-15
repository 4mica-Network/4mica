import { links } from "@services/links";
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const DISALLOW_PATHS = [
  "/api",
  "/api/*",
  "/_next",
  "/_next/*",
  "/admin",
  "/admin/*",
];

const SITEMAP_PATH = "/sitemap.xml";

const isProductionEnvironment = () => process.env.NODE_ENV === "production";

const getSitemapUrl = () => new URL(SITEMAP_PATH, links.website).toString();

const serializeDisallowRules = () =>
  DISALLOW_PATHS.map((path) => ({
    userAgent: "*",
    disallow: path,
  }));

export default function robots(): MetadataRoute.Robots {
  if (!isProductionEnvironment()) {
    return {
      rules: [
        {
          userAgent: "*",
          disallow: "/",
        },
      ],
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
      ...serializeDisallowRules(),
    ],
    sitemap: getSitemapUrl(),
  };
}
