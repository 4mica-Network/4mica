import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { messages } from "@/i18n";
import { profilePath } from "@/utils/profileUrl";

export function ProfileNav({
  username,
  displayName,
  className,
}: {
  username: string;
  displayName: string;
  className?: string;
}) {
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
        {displayName || `@${username}`}
      </Link>
    </nav>
  );
}
