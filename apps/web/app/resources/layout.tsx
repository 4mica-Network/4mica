import { RESOURCES_META_DATA } from "@seo/resources";
import type { Metadata } from "next";

export const metadata: Metadata = RESOURCES_META_DATA;

export default function ResourcesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
