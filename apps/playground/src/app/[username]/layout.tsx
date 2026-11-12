import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/AuthProvider";
import { OwnerBar } from "@/components/OwnerBar";
import { ProfileFooter } from "@/components/ProfileFooter";
import { ProfileTheme } from "@/components/ProfileTheme";
import { messages } from "@/i18n";
import { parseUsername } from "@/schema/params";
import { getPublicProfile } from "@/services/profile";
import { getSessionIdentity } from "@/services/viewer";
import { getNonce } from "@/utils/nonce";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ username: string }>;
}

export default async function ProfileLayout({ children, params }: LayoutProps) {
  const username = parseUsername((await params).username);

  if (!username) {
    notFound();
  }

  const [result, identity, nonce] = await Promise.all([
    getPublicProfile(username),
    getSessionIdentity(),
    getNonce(),
  ]);

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

  const page = (
    <div
      className="profile-scope relative flex min-h-dvh flex-col md:has-[[data-fit-viewport]]:h-dvh md:has-[[data-fit-viewport]]:overflow-hidden"
      style={brandStyle}
    >
      <a
        className="sr-only z-50 rounded-md bg-surface-solid px-3 py-2 text-ink-strong text-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        href="#content"
      >
        {messages.common.skipToContent}
      </a>

      <ProfileTheme nonce={nonce} preference={profile.theme} />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-14 has-[[data-fit-viewport]]:min-h-0 has-[[data-fit-viewport]]:gap-4 has-[[data-fit-viewport]]:pt-16 has-[[data-fit-viewport]]:pb-4 max-md:has-[[data-app-bar]]:gap-0! max-md:has-[[data-app-bar]]:p-0! sm:px-6 sm:py-20 sm:has-[[data-fit-viewport]]:pt-20 sm:has-[[data-fit-viewport]]:pb-6">
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

  return identity ? <AuthProvider>{page}</AuthProvider> : page;
}
