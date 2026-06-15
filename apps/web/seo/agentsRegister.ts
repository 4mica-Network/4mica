import { links } from "@services/links";
import { createPageMetadata } from "./shared";

export const AGENTS_REGISTER_META_DATA = createPageMetadata({
  title: "Register with 4Mica | Deposit Collateral",
  description:
    "Register for 4Mica by connecting a wallet and depositing ETH, USDC, or USDT collateral to start using credit-backed x402 payments.",
  keywords: [
    "4Mica register",
    "agent registration",
    "deposit collateral",
    "x402 payments",
    "USDC collateral",
    "ETH collateral",
    "AI agent wallet",
  ],
  url: links.agentsRegister,
  imageAlt: "Register with 4Mica",
});
