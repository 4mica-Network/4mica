import { LEADERSHIP_META_DATA } from "@seo/leadership";
import type { Metadata } from "next";

export const metadata: Metadata = LEADERSHIP_META_DATA;

export default function LeadershipLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
