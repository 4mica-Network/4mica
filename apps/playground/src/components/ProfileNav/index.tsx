import { ArrowLeft, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { messages } from "@/i18n";
import { profilePath } from "@/utils/profileUrl";

export function ProfileNav({
  username,
  displayName,
}: {
  username: string;
  displayName: string;
}) {
  const label = displayName || `@${username}`;

  return (
    <nav aria-label={messages.common.backToProfile} className="min-w-0">
      <Link
        href={profilePath(username)}
        className="profile-nav-link group flex items-center text-sm max-md:-ml-2 max-md:h-11 max-md:min-w-11 max-md:gap-0.5 max-md:rounded-lg max-md:pr-2 max-md:text-ink-body max-md:transition-colors max-md:active:bg-overlay/6 md:inline-flex md:gap-1.5"
      >
        <ChevronLeft
          aria-hidden="true"
          className="h-5 w-5 shrink-0 md:hidden"
        />
        <ArrowLeft
          aria-hidden="true"
          className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5 max-md:hidden"
        />
        <span className="max-md:truncate">{label}</span>
      </Link>
    </nav>
  );
}
