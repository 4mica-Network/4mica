import type { Metadata } from "next";
import globalFontsVariables from "../fonts";
import "./globals.css";
import { LinkConfig } from "@4mica/url";
import GlobalNetworkBackground from "@components/GlobalNetworkBackground";
import AppKitProvider from "@context/AppKitProvider";
import { HOME_META_DATA } from "@seo/home";
import I18nProvider from "@/i18n/I18nProvider";

const { base } = new LinkConfig({
  ...process.env,
  NEXT_PUBLIC_BASE_URL:
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL,
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
      <body
        suppressHydrationWarning={true}
        className={`${globalFontsVariables} antialiased`}
      >
        <GlobalNetworkBackground />
        <I18nProvider>
          <AppKitProvider>
            <div className="relative z-10 min-h-screen overflow-x-hidden">
              <div className="flex min-h-screen w-full px-4 sm:px-6 lg:px-8">
                <main className="mx-auto size-full min-h-screen max-w-300">
                  {children}
                </main>
              </div>
            </div>
          </AppKitProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
