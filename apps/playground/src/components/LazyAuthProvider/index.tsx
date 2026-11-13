"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { publicEnv } from "@/env";

const ClerkProvider = dynamic(() =>
  import("@clerk/nextjs").then((mod) => mod.ClerkProvider),
);

interface LazyAuthProviderProps {
  children: ReactNode;
  nonce?: string;
}

export function LazyAuthProvider({ children, nonce }: LazyAuthProviderProps) {
  return (
    <ClerkProvider
      nonce={nonce}
      publishableKey={publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
    >
      {children}
    </ClerkProvider>
  );
}
