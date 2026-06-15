import type { Metadata } from "next";
import { ABOUT_META_DATA } from "./about";
import { AGENTS_REGISTER_META_DATA } from "./agentsRegister";
import { BLOG_META_DATA } from "./blog";
import { CAREERS_META_DATA } from "./careers";
import { GETTING_PAID_BY_4MICA_META_DATA } from "./gettingPaidBy4Mica";
import { HOME_META_DATA } from "./home";
import { HOW_4MICA_WORKS_META_DATA } from "./how4MicaWorks";
import { INTERACTIVE_PROTOCOL_META_DATA } from "./interactiveProtocol";
import { LEADERSHIP_META_DATA } from "./leadership";
import { ONE_PAGER_META_DATA } from "./onePager";
import { PAYING_WITH_4MICA_META_DATA } from "./payingWith4Mica";
import { PRIVACY_META_DATA } from "./privacy";
import { REGISTER_META_DATA } from "./register";
import { RESOURCES_META_DATA } from "./resources";
import { ROADMAP_META_DATA } from "./roadmap";
import { TECHNICAL_DOCS_META_DATA } from "./technicalDocs";
import { TERMS_META_DATA } from "./terms";

export const KNOWN_PAGE_PATHS = [
  "/",
  "/about",
  "/agents/register",
  "/careers",
  "/interactive-protocol",
  "/leadership",
  "/privacy",
  "/register",
  "/resources",
  "/resources/blog",
  "/resources/blog/1",
  "/resources/blog/getting-paid-by-4mica",
  "/resources/blog/how-4mica-works",
  "/resources/blog/paying-with-4mica",
  "/resources/one-pager",
  "/resources/technical-docs",
  "/roadmap",
  "/terms",
] as const;

export type PagePath = (typeof KNOWN_PAGE_PATHS)[number];

const PAGE_METADATA_MAP: Record<PagePath, Metadata> = {
  "/": HOME_META_DATA,
  "/about": ABOUT_META_DATA,
  "/agents/register": AGENTS_REGISTER_META_DATA,
  "/careers": CAREERS_META_DATA,
  "/interactive-protocol": INTERACTIVE_PROTOCOL_META_DATA,
  "/leadership": LEADERSHIP_META_DATA,
  "/privacy": PRIVACY_META_DATA,
  "/register": REGISTER_META_DATA,
  "/resources": RESOURCES_META_DATA,
  "/resources/blog": BLOG_META_DATA,
  "/resources/blog/1": GETTING_PAID_BY_4MICA_META_DATA,
  "/resources/blog/getting-paid-by-4mica": GETTING_PAID_BY_4MICA_META_DATA,
  "/resources/blog/how-4mica-works": HOW_4MICA_WORKS_META_DATA,
  "/resources/blog/paying-with-4mica": PAYING_WITH_4MICA_META_DATA,
  "/resources/one-pager": ONE_PAGER_META_DATA,
  "/resources/technical-docs": TECHNICAL_DOCS_META_DATA,
  "/roadmap": ROADMAP_META_DATA,
  "/terms": TERMS_META_DATA,
};

export const pageMetadata = PAGE_METADATA_MAP;

export const DEFAULT_PAGE_PATH: PagePath = "/";
export const FALLBACK_METADATA = pageMetadata[DEFAULT_PAGE_PATH];

const KNOWN_PATH_SET = new Set<string>(KNOWN_PAGE_PATHS);

export const isKnownPagePath = (value: string): value is PagePath =>
  KNOWN_PATH_SET.has(value);

const ensureLeadingSlash = (value: string) =>
  value.startsWith("/") ? value : `/${value}`;

const stripTrailingSlash = (value: string) =>
  value === "/" ? value : value.replace(/\/+$/, "");

export const normalizePath = (
  value: string | null | undefined,
): PagePath | undefined => {
  if (!value || value.trim().length === 0) return DEFAULT_PAGE_PATH;

  const [pathPart] = value.split(/[?#]/);
  const raw = pathPart ?? "/";
  const withLeadingSlash = ensureLeadingSlash(raw);
  const normalized =
    withLeadingSlash === "/" ? "/" : stripTrailingSlash(withLeadingSlash);

  if (isKnownPagePath(normalized)) {
    return normalized;
  }

  if (normalized === "/") {
    return DEFAULT_PAGE_PATH;
  }

  return undefined;
};

export const resolvePageMetadata = (
  value: string | null | undefined,
): Metadata => pageMetadata[normalizePath(value) ?? DEFAULT_PAGE_PATH];
