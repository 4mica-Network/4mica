import { buildProfileLlmsTxt } from "@/lib/llms-txt";
import { parseUsername } from "@/schema/params";
import { listPublicAgents } from "@/services/agents";
import { listPublicApiListings } from "@/services/api-listings";
import { getPublicProfile } from "@/services/profile";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const raw = await params;
  const username = parseUsername(raw.username);

  if (!username) {
    return new Response("Not found\n", { status: 404 });
  }

  const result = await getPublicProfile(username);

  if (!result?.profile.isPublished) {
    return new Response("Not found\n", { status: 404 });
  }

  const [listings, agents] = await Promise.all([
    listPublicApiListings(result.ownerId),
    listPublicAgents(result.ownerId),
  ]);

  return new Response(buildProfileLlmsTxt(result.profile, listings, agents), {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control":
        "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
