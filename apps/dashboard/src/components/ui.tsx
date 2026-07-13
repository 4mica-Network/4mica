import { cn } from "@4mica/ui";
import { useTitle } from "ahooks";
import type { ReactNode } from "react";
import type { TransactionStatus, Verification } from "../data/types";
import { ORG_NAME } from "../pages";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-overlay/10 bg-surface/60 p-5 backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  useTitle(`${title} - ${ORG_NAME}`);
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-ink-muted text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-2xs text-ink-subtle uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-1 font-semibold text-ink-strong text-xl">{value}</div>
      {hint && <div className="mt-0.5 text-ink-muted text-xs">{hint}</div>}
    </Card>
  );
}

const TONE = {
  green: "bg-brand-teal/15 text-brand-teal",
  amber: "bg-amber-400/15 text-amber-500",
  red: "bg-destructive/15 text-destructive",
  slate: "bg-overlay/10 text-ink-muted",
} as const;

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: keyof typeof TONE;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs",
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

export function VerificationBadge({ status }: { status: Verification }) {
  const tone =
    status === "verified" ? "green" : status === "pending" ? "amber" : "slate";
  return <Badge tone={tone}>{status}</Badge>;
}

export function StatusBadge({ status }: { status: TransactionStatus }) {
  const tone =
    status === "settled" ? "green" : status === "pending" ? "amber" : "red";
  return <Badge tone={tone}>{status}</Badge>;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-ink-muted text-sm">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-overlay/20 border-t-brand" />
      {label}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <Card className="text-center text-ink-muted text-sm">{children}</Card>;
}

export function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function formatAmount(amount: string, asset: string): string {
  const unit =
    asset === "0x0000000000000000000000000000000000000000" ? "wei" : "units";
  return `${Number(amount).toLocaleString()} ${unit}`;
}
