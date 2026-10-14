import { cn } from "@4mica/ui";
import type { ReactNode } from "react";

export function Panel({
  title,
  description,
  action,
  children,
  className,
  testId,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-overlay/10 bg-surface",
        className,
      )}
      data-testid={testId}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-ink-strong text-sm">{title}</h2>
          {description && (
            <p className="mt-0.5 text-ink-subtle text-xs">{description}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
