import type { ReactNode } from "react";

export function ListCard({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-overlay/10 overflow-hidden rounded-xl border border-overlay/10">
      {children}
    </div>
  );
}
