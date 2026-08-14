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

/** The in-card empty state, without a competing dashed border. */
export function ListEmpty({ message }: { message: string }) {
  return (
    <p className="px-5 py-8 text-center text-ink-muted text-sm">{message}</p>
  );
}
