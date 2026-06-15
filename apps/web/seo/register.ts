import { links } from "@services/links";
import { createPageMetadata } from "./shared";

export const REGISTER_META_DATA = createPageMetadata({
  title: "Register for 4Mica | Start Using Agent Credit",
  description:
    "Connect your wallet, choose an asset, and deposit collateral to begin using 4Mica credit for x402-compatible agent payments.",
  keywords: [
    "register 4Mica",
    "start with 4Mica",
    "agent credit",
    "x402 registration",
    "collateral deposit",
    "web3 payments onboarding",
  ],
  url: links.register,
  imageAlt: "Register for 4Mica",
});
