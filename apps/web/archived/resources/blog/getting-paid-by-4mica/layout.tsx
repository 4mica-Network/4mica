import { GETTING_PAID_BY_4MICA_META_DATA } from "@seo/gettingPaidBy4Mica";
import type { Metadata } from "next";

export const metadata: Metadata = GETTING_PAID_BY_4MICA_META_DATA;

export default function GettingPaidBy4MicaLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
