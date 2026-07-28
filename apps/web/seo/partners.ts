import { links } from "@4mica/url";
import { messages } from "@/i18n";
import type { PageSeo } from "./shared";

export const PARTNERS_SEO: PageSeo = {
  path: links.partners,
  title: messages.seo.partners.title,
  description: messages.seo.partners.description,
  keywords: [...messages.seo.partners.keywords],
  imageAlt: messages.seo.partners.imageAlt,
};
