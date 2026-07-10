import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "4Mica × x402 — Next.js paywall",
  description:
    "A Next.js App Router route protected by @4mica/sdk-next. Pay per request with x402.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="backdrop" aria-hidden="true">
          <div className="orb orb-a" />
          <div className="orb orb-b" />
        </div>
        {children}
      </body>
    </html>
  );
}
