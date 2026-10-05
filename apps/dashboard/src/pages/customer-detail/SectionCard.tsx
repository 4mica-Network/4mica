import { cn } from "@4mica/ui";
import type { ReactNode } from "react";
import { Card } from "@/components/form";

export function SectionCard({
  title,
  description,
  action,
  children,
  "data-testid": testId,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <Card className="flex flex-col gap-5" data-testid={testId}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-base text-ink-strong">{title}</h3>
          {description && (
            <p className="mt-1 text-ink-muted text-sm">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {children}
    </Card>
  );
}

export function SectionFooter({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-6 -mb-5 flex items-center justify-end gap-2 border-overlay/10 border-t px-6 pt-4 pb-5">
      {children}
    </div>
  );
}

export function SectionRows({
  children,
  "data-testid": testId,
}: {
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <div
      className="-mx-6 divide-y divide-overlay/10 border-overlay/10 border-y"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function SectionRow({
  children,
  actions,
  "data-testid": testId,
}: {
  children: ReactNode;
  actions?: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <div
      className="group flex items-start justify-between gap-4 px-6 py-4 transition-colors hover:bg-overlay/5"
      data-testid={testId}
    >
      {children}
      {actions && (
        <div className="flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}

export function SectionInset({
  children,
  className,
  "data-testid": testId,
}: {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-overlay/10 bg-overlay/5 px-4 py-4",
        className,
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
