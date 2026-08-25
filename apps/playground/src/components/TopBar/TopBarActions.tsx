"use client";

import { Button } from "@4mica/ui";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { messages } from "@/i18n";
import { links } from "@/services/links";
import type { SessionIdentity } from "@/types";

function DashboardLink({ identity }: { identity: SessionIdentity }) {
  const { user } = useUser();

  const name = identity.name || user?.fullName || "";
  const avatarUrl = identity.avatarUrl ?? user?.imageUrl ?? null;

  return (
    <a
      href={links.app}
      aria-label={messages.auth.dashboard}
      title={messages.auth.dashboard}
      className="flex items-center rounded-full p-0.5 transition-colors hover:bg-overlay/10"
    >
      <Avatar
        src={avatarUrl}
        name={name}
        username={identity.username ?? ""}
        size="sm"
      />
    </a>
  );
}

function JoinActions() {
  const pathname = usePathname();
  const target = `?redirect_url=${encodeURIComponent(pathname)}`;

  return (
    <>
      <Button intent="ghost" size="sm" asChild>
        <Link href={`/sign-in${target}`}>{messages.auth.signIn}</Link>
      </Button>
      <Button size="sm" asChild>
        <Link href={`/sign-up${target}`}>{messages.auth.join}</Link>
      </Button>
    </>
  );
}

export function TopBarActions({
  identity,
}: {
  identity: SessionIdentity | null;
}) {
  return (
    <div className="flex items-center gap-2">
      {identity ? <DashboardLink identity={identity} /> : <JoinActions />}
    </div>
  );
}
