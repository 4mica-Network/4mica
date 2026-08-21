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
    <div className="profile-scope relative min-h-screen" style={brandStyle}>
      <TopBar />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-14 sm:py-20">
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
