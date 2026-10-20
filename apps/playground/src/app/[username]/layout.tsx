import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { OwnerBar } from "@/components/OwnerBar";
import { ProfileFooter } from "@/components/ProfileFooter";
import { TopBar } from "@/components/TopBar";
import { parseUsername } from "@/schema/params";
import { getPublicProfile } from "@/services/profile";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ username: string }>;
}

export default async function ProfileLayout({ children, params }: LayoutProps) {
  const username = parseUsername((await params).username);

  if (!username) {
    notFound();
  }

  const result = await getPublicProfile(username);

  if (!result) {
    notFound();
  }

  const { profile } = result;

  const brandStyle = profile.primaryBrandColor
    ? ({
        "--profile-brand": profile.primaryBrandColor,
        "--profile-brand-soft": `${profile.primaryBrandColor}1f`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      className="profile-scope relative flex min-h-dvh flex-col has-[[data-fit-viewport]]:h-dvh has-[[data-fit-viewport]]:overflow-hidden"
      style={brandStyle}
    >
      <TopBar />

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-14 has-[[data-fit-viewport]]:min-h-0 has-[[data-fit-viewport]]:gap-4 has-[[data-fit-viewport]]:pt-16 has-[[data-fit-viewport]]:pb-4 sm:px-6 sm:py-20 sm:has-[[data-fit-viewport]]:pt-20 sm:has-[[data-fit-viewport]]:pb-6">
        {/*
          Owner-only, and only while the profile is still private: a published
          profile should look to its owner exactly as it looks to everyone else.
        */}
        {profile.isOwner && !profile.isPublished && (
          <OwnerBar username={profile.username} />
        )}

        {children}

        <ProfileFooter show={profile.showBranding} />
      </div>
    </div>
  );
}
