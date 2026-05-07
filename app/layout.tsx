import type { Metadata } from "next";
import { Geist, Geist_Mono, Pacifico, Space_Grotesk } from "next/font/google";
import "./globals.css";
import GlobalNetworkBackground from "../components/GlobalNetworkBackground";
import AppKitProvider from "../context/AppKitProvider";

const pacifico = Pacifico({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-pacifico',
})

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

export const metadata: Metadata = {
  title: "4Mica",
  description: "4Mica - Sub-second transactions across any blockchain",
  openGraph: {
    title: "4Mica",
    description: "4Mica - Sub-second transactions across any blockchain",
    images: [
      {
        url: "/assets/logo.jpg",
        width: 2048,
        height: 2048,
        alt: "4Mica Logo",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "4Mica",
    description: "4Mica - Sub-second transactions across any blockchain",
    images: ["/assets/logo.jpg"],
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
          <div className="relative z-10 min-h-screen">
            {children}
          </div>
        </AppKitProvider>
      </body>
    </html>
  );
}
