import { TECHNICAL_DOCS_META_DATA } from "@seo/technicalDocs";
import type { Metadata } from "next";

export const metadata: Metadata = TECHNICAL_DOCS_META_DATA;

export default function TechnicalDocsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
