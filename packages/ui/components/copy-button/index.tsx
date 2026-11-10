import { Check, Copy } from "lucide-react";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { cn } from "../../lib/cn";

export interface CopyButtonProps {
  value: string;
  labels?: { copy?: string; copied?: string };
  hideLabel?: boolean;
  resetAfterMs?: number;
  className?: string;
  "data-testid"?: string;
}

export function CopyButton({
  value,
  labels,
  hideLabel = false,
  resetAfterMs,
  className,
  ...props
}: CopyButtonProps) {
  const { copied, copy } = useCopyToClipboard(resetAfterMs);
  const label = copied
    ? (labels?.copied ?? "Copied")
    : (labels?.copy ?? "Copy");
  const Icon = copied ? Check : Copy;

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => void copy(value)}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-2xs uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/40",
        copied
          ? "text-ink-strong"
          : "text-ink-subtle hover:bg-overlay/10 hover:text-ink-body",
        className,
      )}
      data-copied={copied || undefined}
      data-testid={props["data-testid"]}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      {!hideLabel && label}
    </button>
  );
}
