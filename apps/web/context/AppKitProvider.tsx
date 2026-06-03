"use client";

import { createAppKit } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { type Config, WagmiProvider } from "wagmi";
import { networks, projectId, wagmiAdapter } from "@/config/appkit";

const queryClient = new QueryClient();

const resolveAppUrl = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_VERCEL_URL;
  if (!envUrl) return "https://4mica.xyz";
  return envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;
};

const appUrl = resolveAppUrl();

const metadata = {
  name: "4Mica",
  description: "4Mica - Sub-second transactions across any blockchain",
  url: appUrl,
  icons: [`${appUrl}/assets/logo_transparent.png`],
};

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  metadata,
  features: {
    analytics: true,
  },
});

type AppKitProviderProps = {
  children: React.ReactNode;
};

export default function AppKitProvider({ children }: AppKitProviderProps) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
