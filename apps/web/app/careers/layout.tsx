import { CAREERS_META_DATA } from "@seo/careers";
import type { Metadata } from "next";

export const metadata: Metadata = CAREERS_META_DATA;

export default function CareersLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
