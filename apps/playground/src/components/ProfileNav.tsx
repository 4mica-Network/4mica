import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { messages } from "@/i18n";
import { profilePath } from "@/utils/profileUrl";

/** Breadcrumb back to the profile, used by the agent and API detail pages. */
export function ProfileNav({
  username,
  displayName,
}: {
  username: string;
  displayName: string;
}) {
  return (
    <nav aria-label={messages.common.backToProfile}>
      <Link
        href={profilePath(username)}
        className="link-muted inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {displayName || `@${username}`}
      </Link>
    </nav>
  );
}
