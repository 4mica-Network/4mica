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
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    shortcut: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/icon.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html className="dark" lang="en" suppressHydrationWarning={true}>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, self-authored theme bootstrap with no user input. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        suppressHydrationWarning={true}
        className={`${fontVariables} min-h-screen bg-surface-deep text-ink-body antialiased`}
      >
        {/*
          ClerkProvider is a client component, so wrapping <html> would put the
          document — and the theme script in <head> — inside a client tree,
          where React never executes a script tag. It only has to be above the
          components that use Clerk, which all live in children.
        */}
        <ClerkProvider
          publishableKey={publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
        >
          <ThemeProvider>{children}</ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
