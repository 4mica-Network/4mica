import { links } from "@4mica/url";
import { messages } from "@/i18n";
import type { PageSeo } from "./shared";

export const DEVELOPERS_SEO: PageSeo = {
  path: links.developers,
  title: messages.seo.developers.title,
  description: messages.seo.developers.description,
  keywords: [...messages.seo.developers.keywords],
  imageAlt: messages.seo.developers.imageAlt,
};
