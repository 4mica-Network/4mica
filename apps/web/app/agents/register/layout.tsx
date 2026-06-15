import { AGENTS_REGISTER_META_DATA } from "@seo/agentsRegister";
import type { Metadata } from "next";

export const metadata: Metadata = AGENTS_REGISTER_META_DATA;

export default function AgentsRegisterLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
