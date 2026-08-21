import type { ReactNode } from "react";

/**
 * The frame a list of rows sits in. Rows are its direct children, so the
 * `divide-y` here is what separates them.
 */
export function ListCard({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-overlay/10 overflow-hidden rounded-xl border border-overlay/10">
      {children}
    </div>
  );
}
