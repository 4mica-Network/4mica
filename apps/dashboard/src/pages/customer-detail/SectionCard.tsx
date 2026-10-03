import { cn } from "@4mica/ui";
import type { ReactNode } from "react";
import { Card } from "@/components/form";

/**
 * A whole section in one card: heading, blurb, its control and its content.
 * Unlike SettingsSection, which leaves the heading outside the border, so the
 * customer page reads as a stack of self-contained panels.
 */
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

/**
 * The save row at the foot of a section. `-mx-6` cancels the card padding so
 * the rule spans the full width, the way EditableCard does on the settings
 * pages.
 */
export function SectionFooter({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-6 -mb-5 flex items-center justify-end gap-2 border-overlay/10 border-t px-6 pt-4 pb-5">
      {children}
    </div>
  );
}

/** A nested editor inside a section, set apart without a second card. */
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
