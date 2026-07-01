import { links } from "@4mica/url";
import { messages } from "@/i18n";
import { createPageMetadata } from "./shared";

export const HOME_META_DATA = createPageMetadata({
  title: messages.seo.home.title,
  description: messages.seo.home.description,
  keywords: [...messages.seo.home.keywords],
  url: links.home,
  imageAlt: messages.seo.home.imageAlt,
});
