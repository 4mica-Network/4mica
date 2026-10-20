import { Avatar } from "@/components/Avatar";
import { ProfileContact } from "@/components/ProfileContact";
import { Prose } from "@/components/Prose";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import type { PublicProfile } from "@/types";

export function ProfileHeader({ profile }: { profile: PublicProfile }) {
  return (
    <header className="flex h-full flex-col gap-5">
      <Avatar
        src={profile.avatarUrl}
        name={profile.name}
        username={profile.username}
        size="xl"
      />

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-semibold text-ink-strong text-xl">
          {profile.name || profile.username}
        </h1>
        {profile.verified && <VerifiedBadge />}
      </div>

      <Prose text={profile.bio} className="text-sm" />

      <div className="mt-auto">
        <ProfileContact
          email={profile.email}
          emailVerified={profile.emailVerified}
          phoneNumber={profile.phoneNumber}
        />
      </div>
    </header>
  );
}
