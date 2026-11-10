import type { ReactNode } from "react";

export function ListCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col divide-y divide-overlay/10">
      {children}
    </div>
  );
}
