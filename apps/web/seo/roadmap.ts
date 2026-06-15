import { links } from "@services/links";
import { createPageMetadata } from "./shared";

export const ROADMAP_META_DATA = createPageMetadata({
  title: "Roadmap | Credit Rails for Web3 Commerce",
  description:
    "Follow the 4Mica roadmap for delivering credit-backed x402 payment rails, validation, settlement, and agent commerce infrastructure.",
  keywords: [
    "4Mica roadmap",
    "x402 roadmap",
    "agent commerce roadmap",
    "web3 payment roadmap",
    "credit rails",
    "on-chain settlement roadmap",
  ],
  url: links.roadmap,
  imageAlt: "4Mica roadmap",
});
