import { links } from "@4mica/url";
import { messages } from "@/i18n";
import { createPageMetadata } from "./shared";

export const CAREERS_META_DATA = createPageMetadata({
  title: messages.seo.careers.title,
  description: messages.seo.careers.description,
  keywords: [...messages.seo.careers.keywords],
  url: links.careers,
  imageAlt: messages.seo.careers.imageAlt,
});
