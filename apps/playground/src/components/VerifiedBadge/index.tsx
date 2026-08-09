import { BadgeCheck } from "lucide-react";
import { messages } from "@/i18n";

export function VerifiedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-brand"
      title={messages.profile.verifiedHint}
    >
      <BadgeCheck aria-hidden="true" className="h-4 w-4" strokeWidth={2.2} />
      <span className="sr-only">{messages.profile.verified}</span>
    </span>
  );
}
