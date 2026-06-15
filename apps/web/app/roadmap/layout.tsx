import { ROADMAP_META_DATA } from "@seo/roadmap";
import type { Metadata } from "next";

export const metadata: Metadata = ROADMAP_META_DATA;

export default function RoadmapLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
