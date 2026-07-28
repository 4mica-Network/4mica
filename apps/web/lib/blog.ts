import fs from "node:fs";
import path from "node:path";
import { tocFromMarkdown } from "@components/legal/tocFromMarkdown";
import type { TocItem } from "@components/TableOfContent";
import {
  type BlogPostMeta,
  readingMinutesOf,
  toCategoryLabel,
} from "@lib/blogMeta";
import matter from "gray-matter";

/**
 * Build-time registry for the MDX posts in `content/blog`.
 *
 * Everything here runs during `next build` (the site is a static export), so
 * the frontmatter is read straight off disk with `gray-matter` — the same
 * pattern `components/legal/readToc.ts` uses. Deliberately *not* marked
 * `server-only`: `seo/pages.ts` imports it so posts land in the sitemap and OG
 * registry, and no client component imports that module.
 */

const BLOG_DIR = path.join(process.cwd(), "content/blog");
const MDX_EXTENSION = ".mdx";

export type BlogPost = BlogPostMeta & {
  toc: TocItem[];
};

const REQUIRED_FIELDS = ["title", "description", "date", "author"] as const;

const toStringArray = (value: unknown): string[] => {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
};

// YAML turns an unquoted `date: 2026-07-22` into a Date; normalize both forms
// to a plain ISO day so sorting and `<time dateTime>` stay stable.
const toIsoDate = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
};

const isPostFile = (entry: string) => entry.endsWith(MDX_EXTENSION);

const postPath = (slug: string) =>
  path.join(BLOG_DIR, `${slug}${MDX_EXTENSION}`);

/**
 * Split raw MDX into validated frontmatter + body. Throws — naming the file —
 * when a required field is missing, so a malformed post fails the build
 * instead of shipping a post with empty metadata.
 */
export const parseBlogPost = (
  slug: string,
  raw: string,
): { meta: BlogPostMeta; content: string } => {
  const { content, data } = matter(raw);

  const missing = REQUIRED_FIELDS.filter((field) => !data[field]);
  if (missing.length > 0) {
    throw new Error(
      `content/blog/${slug}.mdx is missing required frontmatter: ${missing.join(", ")}`,
    );
  }

  const tags = toStringArray(data.tags);

  const meta: BlogPostMeta = {
    slug,
    title: String(data.title),
    description: String(data.description),
    date: toIsoDate(data.date),
    author: String(data.author),
    authorAvatar: data.authorAvatar ? String(data.authorAvatar) : undefined,
    authorRole: data.authorRole ? String(data.authorRole) : undefined,
    // An explicit `category` is used verbatim; a tag fallback gets title-cased.
    category: data.category
      ? String(data.category)
      : toCategoryLabel(tags[0] ?? ""),
    tags,
    thumbnail: data.thumbnail ? String(data.thumbnail) : undefined,
    thumbnailAlt: data.thumbnailAlt ? String(data.thumbnailAlt) : undefined,
    keywords: toStringArray(data.keywords),
    readingMinutes: readingMinutesOf(content),
    draft: data.draft === true,
  };

  return { meta, content };
};

const readPostFile = (slug: string) => {
  const filePath = postPath(slug);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Blog post not found for slug "${slug}"`);
  }

  return parseBlogPost(slug, fs.readFileSync(filePath, "utf-8"));
};

/** Drafts are visible while developing and hidden from production builds. */
const isPublished = (post: BlogPostMeta) =>
  !post.draft || process.env.NODE_ENV !== "production";

// Newest first; slug breaks ties so the order is deterministic across builds.
const byDateDescending = (a: BlogPostMeta, b: BlogPostMeta) =>
  b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug);

/** Every published post, newest first. */
export const getAllBlogPosts = (): BlogPostMeta[] => {
  if (!fs.existsSync(BLOG_DIR)) return [];

  return fs
    .readdirSync(BLOG_DIR)
    .filter(isPostFile)
    .map((file) => readPostFile(file.slice(0, -MDX_EXTENSION.length)).meta)
    .filter(isPublished)
    .sort(byDateDescending);
};

/** Slugs of every published post — drives `generateStaticParams`. */
export const getBlogSlugs = (): string[] =>
  getAllBlogPosts().map((post) => post.slug);

/** Frontmatter for one post, or undefined if the slug is unknown/unpublished. */
export const getBlogPostMeta = (slug: string): BlogPostMeta | undefined => {
  if (!fs.existsSync(postPath(slug))) return undefined;

  const { meta } = readPostFile(slug);
  return isPublished(meta) ? meta : undefined;
};

/** Frontmatter plus the `##` table of contents for one post. */
export const getBlogPost = (slug: string): BlogPost | undefined => {
  if (!fs.existsSync(postPath(slug))) return undefined;

  const { meta, content } = readPostFile(slug);
  if (!isPublished(meta)) return undefined;

  return { ...meta, toc: tocFromMarkdown(content) };
};
