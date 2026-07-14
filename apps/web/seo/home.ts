import { links } from "@4mica/url";
import { messages } from "@/i18n";
import type { PageSeo } from "./shared";

export const HOME_SEO: PageSeo = {
  path: links.home,
  title: messages.seo.home.title,
  description: messages.seo.home.description,
  keywords: [...messages.seo.home.keywords],
  imageAlt: messages.seo.home.imageAlt,
};
