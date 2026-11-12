import type { ReactNode } from "react";
import { AuthProvider } from "@/components/AuthProvider";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
