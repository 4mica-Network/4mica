import { messages } from "@/i18n";
import type { PageSeo } from "./shared";

export const PRICING_SEO: PageSeo = {
  path: "/pricing",
  title: messages.pricing.seo.title,
  description: messages.pricing.seo.description,
  keywords: [...messages.pricing.seo.keywords],
  imageAlt: messages.pricing.seo.imageAlt,
};
