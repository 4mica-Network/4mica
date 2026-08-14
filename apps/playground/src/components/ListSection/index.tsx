import type { ReactNode } from "react";

/**
 * The single frame every list section lives in. Sections are separated from one
 * another by the divider this draws, so the whole profile reads as one card
 * rather than a stack of them.
 */
export function ListCard({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-overlay/10 overflow-hidden rounded-xl border border-overlay/10">
      {children}
    </div>
  );
}

/**
 * A titled group of rows: a header strip with a count pill, then the rows.
 * Deliberately frameless — ListCard owns the border.
 */
export interface ListSectionProps {
  title: string;
  count: number;
  children: ReactNode;
}

export function ListSection({ title, count, children }: ListSectionProps) {
  return (
    <section>
      <header className="flex items-center gap-2 border-overlay/10 border-b bg-overlay/3 px-5 py-3.5">
        <h2 className="font-medium text-ink-body text-sm">{title}</h2>
        <span className="rounded-md bg-overlay/10 px-1.5 py-0.5 font-medium text-ink-muted text-xs tabular-nums">
          {count}
        </span>
      </header>
      <div className="divide-y divide-overlay/10">{children}</div>
    </section>
  );
}

/** The in-card empty state, without a competing dashed border. */
export function ListEmpty({ message }: { message: string }) {
  return (
    <p className="px-5 py-8 text-center text-ink-muted text-sm">{message}</p>
  );
}
