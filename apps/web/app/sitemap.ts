import { getAllBlogPosts } from "@lib/blog";
import { allPagePaths } from "@seo/pages";
import { links } from "@services/links";
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const baseUrl = links.website;

const toAbsoluteUrl = (path: string) =>
  path === "/" ? baseUrl : new URL(path, baseUrl).toString();

type Entry = MetadataRoute.Sitemap[number];

const RANK: { match: (path: string) => boolean; hints: Partial<Entry> }[] = [
  {
    match: (path) => path === "/",
    hints: { priority: 1, changeFrequency: "weekly" },
  },
  {
    match: (path) => path.startsWith("/solutions/") || path === "/solution",
    hints: { priority: 0.9, changeFrequency: "monthly" },
  },
  {
    match: (path) => path === "/pricing" || path === "/partners",
    hints: { priority: 0.9, changeFrequency: "monthly" },
  },
  {
    match: (path) => path === "/blog",
    hints: { priority: 0.8, changeFrequency: "weekly" },
  },
  {
    match: (path) => path.startsWith("/blog/"),
    hints: { priority: 0.7, changeFrequency: "yearly" },
  },
  {
    match: (path) =>
      path.startsWith("/legal/") ||
      path === "/privacy" ||
      path === "/terms" ||
      path === "/dpa",
    hints: { priority: 0.3, changeFrequency: "yearly" },
  },
];

const hintsFor = (path: string): Partial<Entry> =>
  RANK.find((rule) => rule.match(path))?.hints ?? {
    priority: 0.6,
    changeFrequency: "monthly",
  };

export default function sitemap(): MetadataRoute.Sitemap {
  const buildDate = new Date();

  const postDates = new Map(
    getAllBlogPosts().map((post) => [
      `/blog/${post.slug}`,
      new Date(`${post.date}T00:00:00Z`),
    ]),
  );

  return allPagePaths().map((path) => ({
    url: toAbsoluteUrl(path),
    lastModified: postDates.get(path) ?? buildDate,
    ...hintsFor(path),
  }));
}
