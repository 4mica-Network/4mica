import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { MotionProvider } from "@/components/MotionProvider";
import { publicEnv } from "@/env";
import fontVariables from "@/fonts";
import { themeInitScript } from "@/lib/theme";
import { SITE_NAME } from "@/services/seo";
import "@/style/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_BASE_URL),
  title: {
    default: `Profiles · ${SITE_NAME}`,
    template: `%s`,
  },
  description:
    "Public profiles for the agents and APIs running on the 4Mica credit layer.",
  applicationName: SITE_NAME,
  creator: SITE_NAME,
  publisher: SITE_NAME,
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    shortcut: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/icon.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html className="dark" lang="en" suppressHydrationWarning={true}>
      <head>
        <link rel="preconnect" href="https://img.clerk.com" />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, self-authored theme bootstrap with no user input. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        suppressHydrationWarning={true}
        className={`${fontVariables} min-h-dvh bg-surface-deep text-ink-body antialiased`}
      >
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
