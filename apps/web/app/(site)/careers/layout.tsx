import { metaFor } from "@seo/pages";
import type { Metadata } from "next";

export const metadata: Metadata = metaFor("/careers");

export default function CareersLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
