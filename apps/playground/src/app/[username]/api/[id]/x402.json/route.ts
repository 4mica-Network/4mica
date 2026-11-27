import { buildApiListingDescriptor } from "@/lib/descriptor";
import {
  descriptorResponse,
  notFoundResponse,
} from "@/services/descriptor-response";
import { resolveApiListing } from "@/services/resource";
import { isIndexable } from "@/services/seo";
import type { ProfileChildPageProps } from "@/types";

export async function GET(
  _request: Request,
  { params }: ProfileChildPageProps,
) {
  const resolved = await resolveApiListing(await params);

  if (!resolved) {
    return notFoundResponse();
  }

  return descriptorResponse(
    buildApiListingDescriptor(resolved.listing, resolved.profile),
    {
      visible: resolved.listing.visibility === "PUBLIC",
      indexable: isIndexable(resolved.profile, resolved.listing.visibility),
    },
  );
}
