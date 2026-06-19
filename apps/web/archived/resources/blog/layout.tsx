import { BLOG_META_DATA } from "@seo/blog";
import type { Metadata } from "next";

export const metadata: Metadata = BLOG_META_DATA;

export default function BlogLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
