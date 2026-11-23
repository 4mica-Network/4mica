import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { publicEnv } from "@/env";

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      dynamic={true}
      publishableKey={publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
    >
      {children}
    </ClerkProvider>
  );
}
