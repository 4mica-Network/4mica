import { metaFor } from "@seo/pages";
import type { Metadata } from "next";

export const metadata: Metadata = metaFor("/terms");

export default function TermsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
