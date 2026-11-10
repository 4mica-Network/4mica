import type { ReactNode } from "react";

export function StepLead({ children }: { children: ReactNode }) {
  return <p className="text-ink-body text-sm leading-relaxed">{children}</p>;
}
