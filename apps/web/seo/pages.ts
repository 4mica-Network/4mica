import type { Metadata } from "next";
import { getSolution, solutionSlugs } from "@/i18n/locales/en/solutions";
import { getAllBlogPosts, getBlogPostMeta } from "@/lib/blog";
import { ABOUT_SEO } from "./about";
import { BLOG_SEO } from "./blog";
import { CAREERS_SEO } from "./careers";
import { DPA_SEO } from "./dpa";
import { HOME_SEO } from "./home";
import { LEADERSHIP_SEO } from "./leadership";
import { PARTNERS_SEO } from "./partners";
import { PRICING_SEO } from "./pricing";
import { PRIVACY_SEO } from "./privacy";
import { RESTRICTED_BUSINESSES_SEO } from "./restrictedBusinesses";
import { type PageSeo, SITE_NAME } from "./shared";
import { SOLUTION_SEO } from "./solution";
import { TERMS_SEO } from "./terms";

/**
 * Single source of truth for every page that ships SEO metadata. Page files
 * read their metadata *from* here (`metaFor`) rather than building it, and OG
 * image generation + the sitemap enumerate the same registry — so "a page has
 * metadata but no OG image / no sitemap entry" is impossible by construction.
 */

// The one path -> slug transform, used everywhere. "/" maps to "home" so the
// homepage OG image lives at /og/home.
export const pathToSlug = (path: string): string =>
  path === "/" ? "home" : path.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");

// Module-private metadata factory — the only caller is this registry.
const buildMetadata = (seo: PageSeo): Metadata => {
  const ogImage = `/og/${pathToSlug(seo.path)}`;

  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    robots: "index, follow",
    alternates: { canonical: seo.path },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: seo.path,
      siteName: SITE_NAME,
      images: [{ url: ogImage, width: 1200, height: 630, alt: seo.imageAlt }],
      type: seo.type ?? "website",
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [ogImage],
    },
  };
};

// Static pages, keyed by their canonical path (the key is the source of truth
// for `PagePath`, so `metaFor` only accepts a real route at compile time).
const STATIC_PAGES = {
  "/": HOME_SEO,
  "/about": ABOUT_SEO,
  "/blog": BLOG_SEO,
  "/careers": CAREERS_SEO,
  "/team": LEADERSHIP_SEO,
  "/partners": PARTNERS_SEO,
  "/privacy": PRIVACY_SEO,
  "/solution": SOLUTION_SEO,
  "/terms": TERMS_SEO,
  "/pricing": PRICING_SEO,
  "/dpa": DPA_SEO,
  "/legal/restricted-businesses": RESTRICTED_BUSINESSES_SEO,
} satisfies Record<string, PageSeo>;

export type PagePath = keyof typeof STATIC_PAGES;

const STATIC_PATHS = Object.keys(STATIC_PAGES) as PagePath[];

const solutionPath = (slug: string) => `/solutions/${slug}`;

const blogPostPath = (slug: string) => `/blog/${slug}`;

/** Metadata for a known static page. `path` is checked at compile time. */
export const metaFor = (path: PagePath): Metadata =>
  buildMetadata(STATIC_PAGES[path]);

/** Metadata for a dynamic `/solutions/[slug]` page, or undefined if unknown. */
export const metaForSolution = (slug: string): Metadata | undefined => {
  const solution = getSolution(slug);
  if (!solution) return undefined;

  return buildMetadata({
    path: solutionPath(solution.slug),
    title: `4Mica for ${solution.label}`,
    description: solution.intro,
    keywords: [
      "4Mica",
      solution.label,
      "credit-backed payments",
      "instant settlement",
      "x402",
    ],
    imageAlt: `4Mica for ${solution.label}`,
  });
};

/** Metadata for a dynamic `/blog/[slug]` page, or undefined if unknown. */
export const metaForBlogPost = (slug: string): Metadata | undefined => {
  const post = getBlogPostMeta(slug);
  if (!post) return undefined;

  return buildMetadata({
    path: blogPostPath(post.slug),
    title: `${post.title} | ${SITE_NAME} Blog`,
    description: post.description,
    keywords: [...post.tags, ...post.keywords],
    imageAlt: post.thumbnailAlt ?? post.title,
    type: "article",
  });
};

/**
 * Every canonical page path — static pages plus the expanded solutions and
 * blog posts. Sitemap entries and OG images follow from this list.
 */
export const allPagePaths = (): string[] => [
  ...STATIC_PATHS,
  ...solutionSlugs.map(solutionPath),
  ...getAllBlogPosts().map((post) => blogPostPath(post.slug)),
];

/** OG static params: one slug per page path (drives generateStaticParams). */
export const pageSlugs = (): { slug: string }[] =>
  allPagePaths().map((path) => ({ slug: pathToSlug(path) }));

/** Fallback used when an OG slug can't be resolved. */
export const FALLBACK_METADATA: Metadata = metaFor("/");

// slug -> metadata for the OG route, built once from the same registry.
const metadataBySlug = new Map<string, Metadata>([
  ...STATIC_PATHS.map((path) => [pathToSlug(path), metaFor(path)] as const),
  ...solutionSlugs.flatMap((slug) => {
    const metadata = metaForSolution(slug);
    return metadata
      ? [[pathToSlug(solutionPath(slug)), metadata] as const]
      : [];
  }),
  ...getAllBlogPosts().flatMap((post) => {
    const metadata = metaForBlogPost(post.slug);
    return metadata
      ? [[pathToSlug(blogPostPath(post.slug)), metadata] as const]
      : [];
  }),
]);

export const metadataForSlug = (slug: string): Metadata | undefined =>
  metadataBySlug.get(slug);
