export const SITE_NAME = "4Mica";

export type PageSeo = {
  path: string;
  title: string;
  description: string;
  keywords: string[];
  imageAlt: string;
  type?: "website" | "article";
};
