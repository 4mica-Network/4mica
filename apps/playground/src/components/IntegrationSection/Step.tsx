import type { ReactNode } from "react";

export interface StepProps {
  /** 1-based, rendered as the gutter marker. */
  index: number;
  title: string;
  lead?: string;
  children: ReactNode;
}

/**
 * One numbered step. The marker sits in a fixed-width gutter so the code frames
 * below it all share a left edge.
 */
export function Step({ index, title, lead, children }: StepProps) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-overlay/10 bg-overlay/5 font-mono text-2xs text-ink-subtle"
      >
        {index}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium text-ink-strong">{title}</h3>
          {lead && <p className="text-ink-muted text-sm">{lead}</p>}
        </div>
        {children}
      </div>
    </li>
  );
}

/** The `<ol>` the steps live in. */
export function StepList({ children }: { children: ReactNode }) {
  return <ol className="flex flex-col gap-8">{children}</ol>;
}
