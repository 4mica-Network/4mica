import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentRow } from "@/components/AgentRow";
import { ApiListingRow } from "@/components/ApiListingRow";
import { ListCard, ListEmpty } from "@/components/ListCard";
import { ProfileHeader } from "@/components/ProfileHeader";
import { ProfileTabs } from "@/components/ProfileTabs";
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
              <ListEmpty
                message={
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
              <ListEmpty
                message={
                  profile.isOwner
                    ? messages.profile.noApisOwner
                    : messages.profile.noApis
                }
              />
            )}
          </ListCard>
        }
      />
    </>
  );
}
