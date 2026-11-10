"use client";

import { Tooltip } from "@4mica/ui";
import type { ReactNode } from "react";

export function FactHint({
  hint,
  children,
}: {
  hint: string;
  children: ReactNode;
}) {
  return (
    <Tooltip content={hint} placement="top">
      <button
        aria-label={hint}
        className="grid h-8 w-8 cursor-help place-items-center rounded-lg bg-overlay/6 text-ink-muted transition-colors hover:bg-overlay/10 hover:text-ink-body focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/40"
        type="button"
      >
        {children}
      </button>
    </Tooltip>
  );
}
