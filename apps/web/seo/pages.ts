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

export const pathToSlug = (path: string): string =>
  path === "/" ? "home" : path.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");

const DESCRIPTION_LIMIT = 160;

export const clampDescription = (text: string): string => {
  if (text.length <= DESCRIPTION_LIMIT) return text;

  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  let kept = "";
  for (const sentence of sentences) {
    if ((kept + sentence).trim().length > DESCRIPTION_LIMIT) break;
    kept += sentence;
  }
  kept = kept.trim();

  if (kept.length >= 110) return kept;

  const cut = text.slice(0, DESCRIPTION_LIMIT - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
};

const buildMetadata = (seo: PageSeo): Metadata => {
  const ogImage = `/og/${pathToSlug(seo.path)}`;
  const description = clampDescription(seo.description);

  return {
    title: seo.title,
    description,
    keywords: seo.keywords,
    robots: "index, follow",
    alternates: { canonical: seo.path },
    openGraph: {
      title: seo.title,
      description,
      url: seo.path,
      siteName: SITE_NAME,
      images: [{ url: ogImage, width: 1200, height: 630, alt: seo.imageAlt }],
      type: seo.type ?? "website",
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description,
      images: [ogImage],
    },
  };
};

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

export const metaFor = (path: PagePath): Metadata =>
  buildMetadata(STATIC_PAGES[path]);

export const metaForSolution = (slug: string): Metadata | undefined => {
  const solution = getSolution(slug);
  if (!solution) return undefined;

  return buildMetadata({
    path: solutionPath(solution.slug),
    title:
      solution.seoTitle ?? `${solution.label} | x402 Agentic Payments | 4Mica`,
    description: solution.intro,
    keywords: [
      "4Mica",
      solution.label,
      "x402",
      "agentic payments",
      "payment credit",
      "payment clearing",
      "settlement infrastructure",
      "stablecoin payments",
    ],
    imageAlt: `4Mica x402 credit and settlement for ${solution.label.toLowerCase()}`,
  });
};

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

export const allPagePaths = (): string[] => [
  ...STATIC_PATHS,
  ...solutionSlugs.map(solutionPath),
  ...getAllBlogPosts().map((post) => blogPostPath(post.slug)),
];

export const pageSlugs = (): { slug: string }[] =>
  allPagePaths().map((path) => ({ slug: pathToSlug(path) }));

export const FALLBACK_METADATA: Metadata = metaFor("/");

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
