import type { Metadata } from "next";
import type { ReactNode } from "react";
import fontVariables from "@/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Insight Store",
  description: "Pay-per-request market insights, paid with 4Mica credit.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${fontVariables} antialiased`}>{children}</body>
    </html>
  );
}
