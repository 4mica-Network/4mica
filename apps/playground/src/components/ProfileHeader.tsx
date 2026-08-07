import { Link as UiLink } from "@4mica/ui";
import { Mail } from "lucide-react";
import { messages, t } from "@/i18n";
import type { PublicProfile } from "@/types";
import { formatMonthYear } from "@/utils/formatDate";
import { profileUrl } from "@/utils/profileUrl";
import { Avatar } from "./Avatar";
import { CopyLinkButton } from "./CopyLinkButton";
import { Prose } from "./Prose";
import { VerifiedBadge } from "./VerifiedBadge";

export function ProfileHeader({ profile }: { profile: PublicProfile }) {
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <Avatar
        src={profile.avatarUrl}
        name={profile.name}
        username={profile.username}
        size="lg"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="font-semibold text-2xl text-ink-strong sm:text-3xl">
            {profile.name || profile.username}
          </h1>
          {profile.verified && <VerifiedBadge />}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-muted text-sm">
          <span className="profile-accent font-medium">
            @{profile.username}
          </span>
          <span aria-hidden="true" className="text-ink-subtle">
            ·
          </span>
          <span>
            {t(messages.profile.joined, {
              date: formatMonthYear(profile.memberSince),
            })}
          </span>
        </div>

        <Prose text={profile.bio} className="max-w-2xl" />

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <CopyLinkButton url={profileUrl(profile.username)} />
          {profile.email && (
            <UiLink
              href={`mailto:${profile.email}`}
              variant="muted"
              icon={<Mail aria-hidden="true" className="h-4 w-4" />}
              iconPosition="left"
              className="text-sm"
            >
              {messages.profile.contact}
            </UiLink>
          )}
        </div>
      </div>
    </header>
  );
}
