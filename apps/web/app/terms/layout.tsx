import { TERMS_META_DATA } from "@seo/terms";
import type { Metadata } from "next";

export const metadata: Metadata = TERMS_META_DATA;

export default function TermsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
