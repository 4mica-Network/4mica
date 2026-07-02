import type { Metadata } from "next";
import globalFontsVariables from "../fonts";
import "./globals.css";
import { LinkConfig } from "@4mica/url";
import GlobalNetworkBackground from "@components/GlobalNetworkBackgroundLazy";
import ThemeProvider, { themeInitScript } from "@context/ThemeProvider";
import { HOME_META_DATA } from "@seo/home";

const { base } = new LinkConfig({
  ...process.env,
  NEXT_PUBLIC_BASE_URL:
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    undefined,
});
const metadataBase = new URL(base);

export const metadata: Metadata = {
  ...HOME_META_DATA,
  metadataBase,
  authors: [{ name: "Mairon Mahzoun" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <head>
        {/* Sets the theme class before paint to avoid a flash of the wrong theme. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, self-authored theme bootstrap script with no user input. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        suppressHydrationWarning={true}
        className={`${globalFontsVariables} antialiased`}
      >
        <ThemeProvider>
          <GlobalNetworkBackground />
          <div className="relative z-10 min-h-screen overflow-x-hidden">
            <div className="flex min-h-screen w-full px-4 sm:px-6 lg:px-8">
              <main className="mx-auto size-full min-h-screen max-w-300">
                {children}
              </main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
