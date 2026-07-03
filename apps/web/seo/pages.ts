import type { Metadata } from "next";
import { getSolution, solutionSlugs } from "@/i18n/locales/en/solutions";
import { ABOUT_SEO } from "./about";
import { CAREERS_SEO } from "./careers";
import { DPA_SEO } from "./dpa";
import { HOME_SEO } from "./home";
import { LEADERSHIP_SEO } from "./leadership";
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
  "/careers": CAREERS_SEO,
  "/team": LEADERSHIP_SEO,
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

/** Every canonical page path — static pages plus the expanded solutions. */
export const allPagePaths = (): string[] => [
  ...STATIC_PATHS,
  ...solutionSlugs.map(solutionPath),
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
]);

export const metadataForSlug = (slug: string): Metadata | undefined =>
  metadataBySlug.get(slug);
