import { links } from "@services/links";
import { createPageMetadata } from "./shared";

export const RESOURCES_META_DATA = createPageMetadata({
  title: "Resources | Docs, Guides, and One-Pager",
  description:
    "Access 4Mica resources including technical documents, integration guides, and a concise one-pager for credit-backed x402 payments.",
  keywords: [
    "4Mica resources",
    "4Mica docs",
    "x402 documentation",
    "agent payment guides",
    "web3 payment resources",
    "4Mica one-pager",
  ],
  url: links.resources,
  imageAlt: "4Mica resources",
});
