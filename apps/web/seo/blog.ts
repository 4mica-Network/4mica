import { links } from "@services/links";
import { createPageMetadata } from "./shared";

export const BLOG_META_DATA = createPageMetadata({
  title: "Blog | Agent Payments and x402 Guides",
  description:
    "Read 4Mica product updates, integration guides, and technical perspectives on x402 credit, agent payments, and on-chain settlement.",
  keywords: [
    "4Mica blog",
    "x402 guides",
    "agent payments blog",
    "web3 payments",
    "AI agent commerce",
    "payment infrastructure",
  ],
  url: links.blog,
  imageAlt: "4Mica blog",
});
