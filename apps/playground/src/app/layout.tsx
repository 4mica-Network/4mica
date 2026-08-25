import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import ThemeProvider, { themeInitScript } from "@/context/ThemeProvider";
import { publicEnv } from "@/env";
import fontVariables from "@/fonts";
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
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <ClerkProvider publishableKey={publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      <html className="dark" lang="en" suppressHydrationWarning={true}>
        <head>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, self-authored theme bootstrap with no user input. */}
          <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        </head>
        <body
          suppressHydrationWarning={true}
          className={`${fontVariables} min-h-screen bg-surface-deep text-ink-body antialiased`}
        >
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
