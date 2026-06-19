import { ABOUT_META_DATA } from "@seo/about";
import type { Metadata } from "next";

export const metadata: Metadata = ABOUT_META_DATA;

export default function AboutLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
