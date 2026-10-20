import { EmptyState } from "@4mica/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentRow } from "@/components/AgentRow";
import { ApiListingRow } from "@/components/ApiListingRow";
import { ListCard } from "@/components/ListCard";
import { ProfileActions } from "@/components/ProfileActions";
import { ProfileHeader } from "@/components/ProfileHeader";
import { ProfileTabs } from "@/components/ProfileTabs";
import { messages } from "@/i18n";
import { parseUsername } from "@/schema/params";
import { listPublicAgents } from "@/services/agents";
import { listPublicApiListings } from "@/services/api-listings";
import { links } from "@/services/links";
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 md:min-h-[calc(100dvh-14rem)] md:justify-center">
      <div className="flex justify-end">
        <ProfileActions
          title={profile.name || `@${profile.username}`}
          url={links.profile(profile.username)}
        />
      </div>

      <section className="grid overflow-hidden rounded-2xl border border-overlay/10 bg-overlay/[0.02] md:min-h-[36rem] md:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="border-overlay/10 border-b p-6 sm:p-8 md:border-r md:border-b-0">
          <ProfileHeader profile={profile} />
        </aside>

        <div className="flex min-h-[22rem] min-w-0 flex-col">
          <ProfileTabs
            agentCount={agents.length}
            apiCount={listings.length}
            agents={
              <ListCard>
                {agents.length > 0 ? (
                  agents.map((agent) => (
                    <AgentRow
                      agent={agent}
                      key={agent.ref}
                      isOwner={profile.isOwner}
                      username={profile.username}
                    />
                  ))
                ) : (
                  <EmptyState
                    className="flex-1"
                    variant="plain"
                    title={messages.profile.noAgentsTitle}
                    description={
                      profile.isOwner
                        ? messages.profile.noAgentsOwner
                        : messages.profile.noAgents
                    }
                  />
                )}
              </ListCard>
            }
            apis={
              <ListCard>
                {listings.length > 0 ? (
                  listings.map((listing) => (
                    <ApiListingRow
                      key={listing.ref}
                      listing={listing}
                      isOwner={profile.isOwner}
                      username={profile.username}
                    />
                  ))
                ) : (
                  <EmptyState
                    className="flex-1"
                    variant="plain"
                    title={messages.profile.noApisTitle}
                    description={
                      profile.isOwner
                        ? messages.profile.noApisOwner
                        : messages.profile.noApis
                    }
                  />
                )}
              </ListCard>
            }
          />
        </div>
      </section>
    </div>
  );
}
