import { DESCRIPTOR_SCHEMA } from "@/lib/descriptor";
import { listDirectory } from "@/services/directory";
import { links } from "@/services/links";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await listDirectory();

  return Response.json(
    {
      $schema: `${DESCRIPTOR_SCHEMA}/directory`,
      generatedAt: new Date().toISOString(),
      protocol: "x402",
      scheme: "4mica-credit",
      docs: links.docs,
      support: links.email.support,
      count: entries.length,
      resources: entries.map((entry) => entry.descriptor),
    },
    {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control":
          "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
