import type { Metadata } from "next";

export const SITE_NAME = "4Mica";
export const DEFAULT_OG_IMAGE = "/assets/logo_transparent.png";

type SeoConfig = {
  title: string;
  description: string;
  keywords: string[];
  url: string;
  imageAlt: string;
  type?: "website" | "article";
};

export const createPageMetadata = ({
  title,
  description,
  keywords,
  url,
  imageAlt,
  type = "website",
}: SeoConfig) =>
  ({
    title,
    description,
    keywords,
    robots: "index, follow",
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
      type,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  }) satisfies Metadata;
