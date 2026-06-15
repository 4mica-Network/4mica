import { links } from "@services/links";
import { createPageMetadata } from "./shared";

export const TERMS_META_DATA = createPageMetadata({
  title: "Terms of Service | 4Mica",
  description:
    "Review the 4Mica Terms of Service for using the site, wallet-connected interfaces, and blockchain payment software.",
  keywords: [
    "4Mica terms",
    "terms of service",
    "web3 terms",
    "blockchain payments terms",
    "4Mica legal",
  ],
  url: links.terms,
  imageAlt: "4Mica Terms of Service",
});
