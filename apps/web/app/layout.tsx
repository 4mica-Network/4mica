import type { Metadata } from "next";
import { Geist, Geist_Mono, Pacifico, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { LinkConfig } from "@4mica/url";
import GlobalNetworkBackground from "@components/GlobalNetworkBackground";
import AppKitProvider from "@context/AppKitProvider";
import { HOME_META_DATA } from "@seo/home";

const pacifico = Pacifico({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pacifico",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

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
        className={`${geistSans.variable} ${geistMono.variable} ${pacifico.variable} ${spaceGrotesk.variable} antialiased`}
      >
        <GlobalNetworkBackground />
        <AppKitProvider>
          <div className="relative z-10 min-h-screen">{children}</div>
        </AppKitProvider>
      </body>
    </html>
  );
}
