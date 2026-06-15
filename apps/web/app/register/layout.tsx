import { REGISTER_META_DATA } from "@seo/register";
import type { Metadata } from "next";

export const metadata: Metadata = REGISTER_META_DATA;

export default function RegisterLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
