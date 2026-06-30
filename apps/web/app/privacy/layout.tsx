import { PRIVACY_META_DATA } from "@seo/privacy";
import type { Metadata } from "next";

export const metadata: Metadata = PRIVACY_META_DATA;

export default function PrivacyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
