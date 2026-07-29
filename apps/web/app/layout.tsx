import type { Metadata } from "next";
import globalFontsVariables from "../fonts";
import "./globals.css";
import { LinkConfig } from "@4mica/url";
import ThemeProvider, { themeInitScript } from "@context/ThemeProvider";
import { metaFor } from "@seo/pages";

const { base } = new LinkConfig({
  ...process.env,
  NEXT_PUBLIC_BASE_URL:
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    undefined,
});
const metadataBase = new URL(base);

const verification = {
  google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
    ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
    : undefined,
};

export const metadata: Metadata = {
  ...metaFor("/"),
  metadataBase,
  applicationName: "4Mica",
  authors: [{ name: "Mairon Mahzoun" }],
  creator: "4Mica",
  publisher: "4Mica",
  verification,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, self-authored theme bootstrap script with no user input. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        suppressHydrationWarning={true}
        className={`${globalFontsVariables} antialiased`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
