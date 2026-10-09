import { cn, Spinner } from "@4mica/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function SurfaceCard({
  className,
  children,
  "data-testid": testId,
}: {
  className?: string;
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-overlay/10 bg-surface px-6 py-5",
        className,
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function SavingIndicator() {
  const { t } = useTranslation();
  return (
    <Spinner
      size="sm"
      title={t("settings.saving")}
      className="text-ink-subtle"
    />
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="font-semibold text-base text-ink-strong">{title}</h3>
        {description && (
          <p className="mt-1 text-ink-muted text-sm">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <SectionHeader title={title} description={description} action={action} />
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function CardHeader({
  title,
  description,
  isSaving,
  action,
}: {
  title: string;
  description?: string;
  isSaving?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h4 className="font-semibold text-ink-strong text-sm">{title}</h4>
        {description && (
          <p className="mt-0.5 text-ink-muted text-xs">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isSaving && <SavingIndicator />}
        {action}
      </div>
    </div>
  );
}

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
    <SurfaceCard className="flex flex-col gap-5" data-testid={testId}>
      <SectionHeader title={title} description={description} action={action} />
      {children}
    </SurfaceCard>
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
