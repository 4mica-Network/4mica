import { Bot, Plug } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentCard } from "@/components/AgentCard";
import { ApiListingCard } from "@/components/ApiListingCard";
import { EmptyState } from "@/components/EmptyState";
import { ProfileHeader } from "@/components/ProfileHeader";
import { messages } from "@/i18n";
import { parseUsername } from "@/schema/params";
import { listPublicAgents } from "@/services/agents";
import { listPublicApiListings } from "@/services/api-listings";
import { getPublicProfile } from "@/services/profile";
import { buildProfileMetadata, notFoundMetadata } from "@/services/seo";
import type { ProfilePageProps } from "@/types";

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const username = parseUsername((await params).username);
  const result = username ? await getPublicProfile(username) : null;

  return result ? buildProfileMetadata(result.profile) : notFoundMetadata();
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const username = parseUsername((await params).username);

  if (!username) {
    notFound();
  }

  const result = await getPublicProfile(username);

  if (!result) {
    notFound();
  }

  const { ownerId, profile } = result;

  const includeHidden = profile.isOwner;

  const [agents, listings] = await Promise.all([
    listPublicAgents(ownerId, includeHidden),
    listPublicApiListings(ownerId, includeHidden),
  ]);

  return (
    <>
      <ProfileHeader profile={profile} />

      {profile.description && (
        <section className="max-w-2xl text-ink-body">
          <p className="whitespace-pre-line leading-relaxed">
            {profile.description}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-ink-strong text-lg">
            {messages.profile.agentsHeading}
          </h2>
          <p className="text-ink-muted text-sm">
            {messages.profile.agentsLead}
          </p>
        </div>

        {agents.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {agents.map((agent) => (
              <AgentCard
                agent={agent}
                key={agent.ref}
                isOwner={profile.isOwner}
                username={profile.username}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Bot aria-hidden="true" className="h-5 w-5" />}
            message={
              profile.isOwner
                ? messages.profile.noAgentsOwner
                : messages.profile.noAgents
            }
          />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-ink-strong text-lg">
            {messages.profile.apisHeading}
          </h2>
          <p className="text-ink-muted text-sm">{messages.profile.apisLead}</p>
        </div>

        {listings.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {listings.map((listing) => (
              <ApiListingCard
                key={listing.ref}
                listing={listing}
                isOwner={profile.isOwner}
                username={profile.username}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Plug aria-hidden="true" className="h-5 w-5" />}
            message={
              profile.isOwner
                ? messages.profile.noApisOwner
                : messages.profile.noApis
            }
          />
        )}
      </section>
    </>
  );
}
