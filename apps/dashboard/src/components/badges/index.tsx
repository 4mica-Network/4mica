import { Tag } from "@4mica/ui";
import { Check } from "lucide-react";

const KYB_VARIANT = {
  VERIFIED: "success",
  PENDING: "warning",
  REJECTED: "error",
  UNVERIFIED: "neutral",
} as const;

export function KybTag({ status, label }: { status: string; label: string }) {
  const variant = KYB_VARIANT[status as keyof typeof KYB_VARIANT] ?? "neutral";

  return (
    <Tag
      size="sm"
      variant={variant}
      icon={status === "VERIFIED" ? <Check className="h-3 w-3" /> : undefined}
      className="shrink-0"
    >
      {label}
    </Tag>
  );
}

export function VerifiedBadge({
  verified,
  labels,
}: {
  verified: boolean;
  labels: { yes: string; no: string };
}) {
  return (
    <Tag
      size="sm"
      variant={verified ? "success" : "neutral"}
      icon={verified ? <Check className="h-3 w-3" /> : undefined}
      className="shrink-0"
    >
      {verified ? labels.yes : labels.no}
    </Tag>
  );
}
