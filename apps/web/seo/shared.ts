export const SITE_NAME = "4Mica";

/**
 * Raw, co-located SEO content for a single page. `path` is the canonical
 * route and the key every page is registered under in `seo/pages.ts`.
 * The finished Next.js `Metadata` is built only inside the registry, so a
 * page cannot ship metadata without being registered.
 */
export type PageSeo = {
  path: string;
  title: string;
  description: string;
  keywords: string[];
  imageAlt: string;
  type?: "website" | "article";
};
