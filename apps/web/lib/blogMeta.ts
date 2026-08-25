export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  authorAvatar?: string;
  authorRole?: string;
  category: string;
  tags: string[];
  thumbnail?: string;
  thumbnailAlt?: string;
  keywords: string[];
  readingMinutes: number;
  draft: boolean;
};

const WORDS_PER_MINUTE = 200;

export const readingMinutesOf = (content: string): number =>
  Math.max(
    1,
    Math.round(content.trim().split(/\s+/).length / WORDS_PER_MINUTE),
  );

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

export const formatPostDate = (date: string): string =>
  dateFormatter.format(new Date(`${date}T00:00:00Z`));
