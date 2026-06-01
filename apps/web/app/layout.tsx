import type { Metadata } from "next";
import { Geist, Geist_Mono, Pacifico, Space_Grotesk } from "next/font/google";
import "./globals.css";
import GlobalNetworkBackground from "../components/GlobalNetworkBackground";
import AppKitProvider from "../context/AppKitProvider";

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

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_VERCEL_URL ??
  "https://4mica.xyz";
const metadataBase = new URL(
  siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`,
);

export const metadata: Metadata = {
  metadataBase,
  title: "4Mica",
  description: "The clearinghouse for the agentic economy",
  authors: [{ name: "Mairon Mahzoun" }],
  openGraph: {
    title: "4Mica",
    description: "The clearinghouse for the agentic economy",
    images: [
      {
        url: "/assets/logo_transparent.png",
        width: 264,
        height: 192,
        alt: "4Mica Logo",
      },
    ],
    type: "article",
    publishedTime: "2026-05-07T00:00:00Z",
  },
  twitter: {
    card: "summary_large_image",
    title: "4Mica",
    description: "The clearinghouse for the agentic economy",
    images: ["/assets/logo_transparent.png"],
  },
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
