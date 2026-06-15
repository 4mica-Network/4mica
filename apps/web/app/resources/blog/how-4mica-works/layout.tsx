import { HOW_4MICA_WORKS_META_DATA } from "@seo/how4MicaWorks";
import type { Metadata } from "next";

export const metadata: Metadata = HOW_4MICA_WORKS_META_DATA;

export default function How4MicaWorksLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
