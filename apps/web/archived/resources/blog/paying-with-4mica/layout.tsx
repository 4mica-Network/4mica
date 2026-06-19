import { PAYING_WITH_4MICA_META_DATA } from "@seo/payingWith4Mica";
import type { Metadata } from "next";

export const metadata: Metadata = PAYING_WITH_4MICA_META_DATA;

export default function PayingWith4MicaLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
