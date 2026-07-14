import { allPagePaths } from "@seo/pages";
import { links } from "@services/links";
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const baseUrl = links.website;

const toAbsoluteUrl = (path: string) =>
  path === "/" ? baseUrl : new URL(path, baseUrl).toString();

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return allPagePaths().map((path) => ({
    url: toAbsoluteUrl(path),
    lastModified,
  }));
}
