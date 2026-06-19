import { links } from "@4mica/url";
import { createPageMetadata } from "./shared";

export const PAYING_WITH_4MICA_META_DATA = createPageMetadata({
  title: "Paying with 4Mica | Payer Guide",
  description:
    "A payer-first guide to funding collateral, signing 4Mica payment headers, retrying versioned flows, and settling tabs on-chain.",
  keywords: [
    "paying with 4Mica",
    "4Mica payer guide",
    "x402 payer",
    "payment headers",
    "collateral funding",
    "settle tabs",
    "validation-gated guarantees",
  ],
  url: links.payingWith4Mica,
  imageAlt: "Paying with 4Mica",
  type: "article",
});
