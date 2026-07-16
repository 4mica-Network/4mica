import { metaFor } from "@seo/pages";
import type { Metadata } from "next";

export const metadata: Metadata = metaFor("/team");

export default function LeadershipLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
