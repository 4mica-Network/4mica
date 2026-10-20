import type { Metadata } from "next";
import type { ReactNode } from "react";
import fontVariables from "@/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Credit Wallet",
  description: "Deposit collateral once, then pay for x402 routes on credit.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${fontVariables} antialiased`}>{children}</body>
    </html>
  );
}
