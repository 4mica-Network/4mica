import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { OwnerBar } from "@/components/OwnerBar";
import { ProfileFooter } from "@/components/ProfileFooter";
import { parseUsername } from "@/schema/params";
import { getPublicProfile } from "@/services/profile";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ username: string }>;
}

/**
 * The gate. Every page under /[username] renders inside this, so the visibility
 * check cannot be forgotten on a new route.
 *
 * getPublicProfile is React-cache()'d, so the page below reuses this query
 * rather than issuing a second one.
 */
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

  // Only applied when allowCustomBrandColor is on and the stored value
  // re-passed the hex regex in the mapper.
  const brandStyle = profile.primaryBrandColor
    ? ({
        "--profile-brand": profile.primaryBrandColor,
        "--profile-brand-soft": `${profile.primaryBrandColor}1f`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div className="profile-scope min-h-screen" style={brandStyle}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10 sm:py-14">
        {profile.isOwner && (
          <OwnerBar
            isPublished={profile.isPublished}
            username={profile.username}
          />
        )}

        {children}

        <ProfileFooter show={profile.showBranding} />
      </div>
    </div>
  );
}
