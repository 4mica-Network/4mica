import { cn } from "@4mica/ui";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { messages } from "@/i18n";
import { profilePath } from "@/utils/profileUrl";

export function ProfileNav({
  username,
  displayName,
  className,
  variant = "float",
}: {
  username: string;
  displayName: string;
  className?: string;
  variant?: "float" | "bar";
}) {
  const label = displayName || `@${username}`;

  if (variant === "bar") {
    return (
      <nav
        aria-label={messages.common.backToProfile}
        className={cn("min-w-0", className)}
      >
        <Link
          href={profilePath(username)}
          className="-ml-2 flex h-11 min-w-11 items-center gap-0.5 rounded-lg pr-2 text-ink-body text-sm transition-colors active:bg-overlay/6"
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5 shrink-0" />
          <span className="truncate">{label}</span>
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label={messages.common.backToProfile} className={className}>
      <Link
        href={profilePath(username)}
        className="link-muted group inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft
          aria-hidden="true"
          className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5"
        />
        {label}
      </Link>
    </nav>
  );
}
