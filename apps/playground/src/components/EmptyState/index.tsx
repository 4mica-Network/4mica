import { cn } from "@4mica/ui";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 rounded-lg border border-overlay/10 border-dashed px-4 py-5",
        className,
      )}
    >
      {icon && (
        <span aria-hidden="true" className="text-ink-subtle">
          {icon}
        </span>
      )}

      <p className="font-medium text-ink-strong text-sm">{title}</p>

      {description && (
        <p className="text-ink-muted text-sm leading-relaxed">{description}</p>
      )}

      {action}
    </div>
  );
}
