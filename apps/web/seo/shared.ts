import type { Metadata } from "next";

export const SITE_NAME = "4Mica";
export const DEFAULT_OG_IMAGE = "/og/home";

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
}: SeoConfig) => {
  const ogImage =
    url === "/"
      ? DEFAULT_OG_IMAGE
      : `/og/${url.replace(/^\/+|\/+$/g, "").replace(/\//g, "-")}`;

  return {
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
          url: ogImage,
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
      images: [ogImage],
    },
  } satisfies Metadata;
};
