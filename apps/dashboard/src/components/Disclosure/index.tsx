import { cn } from "@4mica/ui";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

export function Disclosure({
  label,
  defaultOpen = false,
  forceOpen = false,
  children,
  className,
  "data-testid": testId,
}: {
  label: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const open = expanded || forceOpen;
  const panelId = useId();
  return (
    <div className={cn("flex flex-col", className)} data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setExpanded(!open)}
        className="flex items-center gap-1 self-start rounded-md py-1 font-medium text-ink-muted text-sm hover:text-ink-strong"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
        />
        {label}
      </button>
      {open && (
        <div id={panelId} className="flex flex-col pt-1">
          {children}
        </div>
      )}
    </div>
  );
}
