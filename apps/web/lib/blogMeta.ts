/**
 * Post metadata shape plus the helpers that format it for display.
 *
 * Deliberately free of `node:fs`: the category filter on `/blog` runs in the
 * browser, so its cards import from here while `lib/blog.ts` keeps the
 * build-time filesystem registry to itself.
 */

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  author: string;
  /** Public URL of the author portrait; falls back to initials when absent. */
  authorAvatar?: string;
  /** Shown under the author name on the featured card, e.g. "CTO & Co-Founder". */
  authorRole?: string;
  /** Display label used for the filter row and the card chip. */
  category: string;
  tags: string[];
  thumbnail?: string;
  thumbnailAlt?: string;
  keywords: string[];
  /** Estimated read time in whole minutes (min 1). */
  readingMinutes: number;
  draft: boolean;
};

const WORDS_PER_MINUTE = 200;

export const readingMinutesOf = (content: string): number =>
  Math.max(
    1,
    Math.round(content.trim().split(/\s+/).length / WORDS_PER_MINUTE),
  );

/**
 * Title-case a category for display ("best-practices" -> "Best Practices").
 * Tokens that already mix letters and digits (x402) are left alone.
 */
export const toCategoryLabel = (value: string): string =>
  value
    .split(/[-_\s]+/)
    .map((word) =>
      /\d/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/** `2026-07-22` -> `July 22, 2026`. Pinned to UTC so SSG output is stable. */
export const formatPostDate = (date: string): string =>
  dateFormatter.format(new Date(`${date}T00:00:00Z`));
