import type { ResourceDescriptor } from "@/lib/descriptor";

const PUBLIC_CACHE =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const PRIVATE_CACHE = "private, no-store";

export const descriptorResponse = (
  descriptor: ResourceDescriptor,
  indexable: boolean,
): Response =>
  Response.json(descriptor, {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": indexable ? PUBLIC_CACHE : PRIVATE_CACHE,
      "x-robots-tag": indexable ? "all" : "noindex",
    },
  });

export const notFoundResponse = (): Response =>
  Response.json(
    { error: "not_found" },
    {
      status: 404,
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
      },
    },
  );
