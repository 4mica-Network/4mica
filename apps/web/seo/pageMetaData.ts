import type { Metadata } from "next";
import { ABOUT_META_DATA } from "./about";
import { CAREERS_META_DATA } from "./careers";
import { HOME_META_DATA } from "./home";
import { LEADERSHIP_META_DATA } from "./leadership";
import { PRIVACY_META_DATA } from "./privacy";
import { SOLUTION_META_DATA } from "./solution";
import { TERMS_META_DATA } from "./terms";

export const KNOWN_PAGE_PATHS = [
  "/",
  "/about",
  "/careers",
  "/leadership",
  "/privacy",
  "/solution",
  "/terms",
] as const;

export type PagePath = (typeof KNOWN_PAGE_PATHS)[number];

const PAGE_METADATA_MAP: Record<PagePath, Metadata> = {
  "/": HOME_META_DATA,
  "/about": ABOUT_META_DATA,
  "/careers": CAREERS_META_DATA,
  "/leadership": LEADERSHIP_META_DATA,
  "/privacy": PRIVACY_META_DATA,
  "/solution": SOLUTION_META_DATA,
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
