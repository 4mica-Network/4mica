import { ONE_PAGER_META_DATA } from "@seo/onePager";
import type { Metadata } from "next";

export const metadata: Metadata = ONE_PAGER_META_DATA;

export default function OnePagerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
