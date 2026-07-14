import { metaFor } from "@seo/pages";
import type { Metadata } from "next";

export const metadata: Metadata = metaFor("/privacy");

export default function PrivacyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
