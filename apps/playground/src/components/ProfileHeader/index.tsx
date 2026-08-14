import { Avatar } from "@/components/Avatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import type { PublicProfile } from "@/types";

/**
 * Deliberately just the face and the name. The handle is already in the URL,
 * and everything else the profile knows lives on the rows below it.
 */
export function ProfileHeader({ profile }: { profile: PublicProfile }) {
  return (
    <header className="flex flex-col gap-4">
      <Avatar
        src={profile.avatarUrl}
        name={profile.name}
        username={profile.username}
        size="lg"
      />

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-semibold text-ink-strong text-lg">
          {profile.name || profile.username}
        </h1>
        {profile.verified && <VerifiedBadge />}
      </div>
    </header>
  );
}
