import { buildSitemapXml } from "@/lib/sitemap";
import { listDirectory, listProfileHandles } from "@/services/directory";
import { links } from "@/services/links";

export const dynamic = "force-dynamic";

export async function GET() {
  const [handles, directory] = await Promise.all([
    listProfileHandles(),
    listDirectory(),
  ]);

  const entries = [
    ...handles.map((handle) => ({
      url: links.profile(handle.username),
      lastModified: handle.updatedAt,
      priority: 0.6,
    })),
    ...directory
      .filter((entry) => entry.indexable)
      .map((entry) => ({
        url: entry.descriptor.page,
        lastModified: entry.updatedAt,
        priority: entry.descriptor.invocable ? 0.8 : 0.5,
      })),
  ];

  return new Response(buildSitemapXml(entries), {
    headers: {
      "cache-control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "content-type": "application/xml; charset=utf-8",
    },
  });
}
