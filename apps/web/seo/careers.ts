import { links } from "@4mica/url";
import { messages } from "@/i18n";
import type { PageSeo } from "./shared";

export const CAREERS_SEO: PageSeo = {
  path: links.careers,
  title: messages.seo.careers.title,
  description: messages.seo.careers.description,
  keywords: [...messages.seo.careers.keywords],
  imageAlt: messages.seo.careers.imageAlt,
};
