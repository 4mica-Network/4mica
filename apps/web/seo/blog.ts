import { links } from "@4mica/url";
import { messages } from "@/i18n";
import type { PageSeo } from "./shared";

export const BLOG_SEO: PageSeo = {
  path: links.blog,
  title: messages.seo.blog.title,
  description: messages.seo.blog.description,
  keywords: [...messages.seo.blog.keywords],
  imageAlt: messages.seo.blog.imageAlt,
};
