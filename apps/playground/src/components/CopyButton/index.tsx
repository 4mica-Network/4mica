"use client";

import { cn } from "@4mica/ui";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { messages } from "@/i18n";

const RESET_MS = 1600;

export interface CopyButtonProps {
  /** The raw source, not the highlighted markup. */
  value: string;
  className?: string;
}

export function CopyButton({ value, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clearing on unmount avoids setting state on a component the reader has
  // already navigated away from.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access is denied in insecure contexts and some embedded
      // webviews. Nothing actionable for the reader — the code is on screen and
      // selectable — so fail quietly rather than showing a false "Copied".
      return;
    }

    setCopied(true);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), RESET_MS);
  };

  const label = copied
    ? messages.integration.copied
    : messages.integration.copy;

  return (
    <button
      aria-label={label}
      // Fixed white alphas rather than `ink-*` tokens: this button only ever
      // sits on a `.code-surface`, which stays dark in light mode, where a
      // theme-aware ink colour would render dark-on-dark.
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-2xs uppercase tracking-wider transition-colors",
        copied
          ? "text-white"
          : "text-white/50 hover:bg-white/10 hover:text-white/90",
        className,
      )}
      onClick={copy}
      type="button"
    >
      {copied ? (
        <Check aria-hidden="true" className="h-3 w-3" />
      ) : (
        <Copy aria-hidden="true" className="h-3 w-3" />
      )}
      {label}
    </button>
  );
}
