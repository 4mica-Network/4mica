import { links } from "@4mica/url";
import { createPageMetadata } from "./shared";

export const TECHNICAL_DOCS_META_DATA = createPageMetadata({
  title: "Technical Docs | SDK and Protocol Reference",
  description:
    "Read the 4Mica technical documentation for SDK setup, facilitator APIs, operator APIs, payment flows, guarantees, and examples.",
  keywords: [
    "4Mica technical docs",
    "4Mica SDK",
    "x402 integration",
    "facilitator API",
    "operator API",
    "payment guarantee docs",
    "agent payment documentation",
  ],
  url: links.technicalDocs,
  imageAlt: "4Mica technical documentation",
});
