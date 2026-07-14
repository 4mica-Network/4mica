import { metaFor } from "@seo/pages";
import type { Metadata } from "next";

export const metadata: Metadata = metaFor("/about");

export default function AboutLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
