import { Avatar } from "@/components/Avatar";
import { Prose } from "@/components/Prose";
import { RevealLink } from "@/components/RevealLink";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import type { PublicProfile } from "@/types";

export function ProfileHeader({ profile }: { profile: PublicProfile }) {
  return (
    <header className="flex flex-col gap-4">
      <Avatar
        src={profile.avatarUrl}
        name={profile.name}
        username={profile.username}
        size="lg"
      />

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-semibold text-ink-strong text-lg">
            {profile.name || profile.username}
          </h1>
          {profile.verified && <VerifiedBadge />}
        </div>

        {profile.email && (
          <RevealLink
            className="self-start text-ink-muted"
            href={`mailto:${profile.email}`}
          >
            {profile.email}
          </RevealLink>
        )}
      </div>

      <Prose text={profile.bio} className="text-sm" />
    </header>
  );
}
