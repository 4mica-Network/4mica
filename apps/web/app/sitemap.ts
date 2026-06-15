import { KNOWN_PAGE_PATHS } from "@seo/pageMetaData";
import { links } from "@services/links";
import type { MetadataRoute } from "next";
import { blogPosts } from "./resources/blog/data";

export const dynamic = "force-static";

const baseUrl = links.website;

const toAbsoluteUrl = (path: string) =>
  path === "/" ? baseUrl : new URL(path, baseUrl).toString();

const toValidDate = (value: string | undefined, fallback: Date) => {
  if (!value) return fallback;

  const parsedDate = new Date(value);

  return Number.isNaN(parsedDate.getTime()) ? fallback : parsedDate;
};

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const blogPostPaths = new Set(blogPosts.map(({ href }) => href));

  const staticPages = KNOWN_PAGE_PATHS.filter(
    (path) => !blogPostPaths.has(path),
  ).map((path) => ({
    url: toAbsoluteUrl(path),
    lastModified,
  }));

  const blogPages = blogPosts.map(({ href, date }) => ({
    url: toAbsoluteUrl(href),
    lastModified: toValidDate(date, lastModified),
  }));

  return [...staticPages, ...blogPages];
}
