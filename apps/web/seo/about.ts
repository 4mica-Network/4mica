import { links } from "@services/links";
import { createPageMetadata } from "./shared";

export const ABOUT_META_DATA = createPageMetadata({
  title: "About 4Mica | Mission and Company",
  description:
    "Learn how 4Mica builds cryptographically backed credit rails for instant, low-friction settlement across web3 services and AI agents.",
  keywords: [
    "about 4Mica",
    "4Mica mission",
    "web3 credit rails",
    "cryptographic credit",
    "programmable credit",
    "agentic commerce",
  ],
  url: links.about,
  imageAlt: "About 4Mica",
});
