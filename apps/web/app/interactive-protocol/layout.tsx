import { INTERACTIVE_PROTOCOL_META_DATA } from "@seo/interactiveProtocol";
import type { Metadata } from "next";

export const metadata: Metadata = INTERACTIVE_PROTOCOL_META_DATA;

export default function InteractiveProtocolLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
