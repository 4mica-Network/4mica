import { Tag } from "@4mica/ui";
import { ListRow } from "@/components/ListRow";
import { VisibilityTag } from "@/components/VisibilityTag";
import { VisibilityToggle } from "@/components/VisibilityToggle";
import type { PublicApiListing } from "@/types";
import { apiListingPath } from "@/utils/profileUrl";

export interface ApiListingRowProps {
  listing: PublicApiListing;
  username: string;
  isOwner: boolean;
}

export function ApiListingRow({
  listing,
  username,
  isOwner,
}: ApiListingRowProps) {
  return (
    <ListRow
      href={apiListingPath(username, listing.ref)}
      title={listing.name}
      description={listing.summary}
      tags={
        <>
          {listing.priceLabel && (
            <Tag size="sm" variant="warning">
              {listing.priceLabel}
            </Tag>
          )}
          {listing.category && (
            <Tag size="sm" variant="neutral">
              {listing.category}
            </Tag>
          )}
          {listing.tags.slice(0, 4).map((tag) => (
            <Tag key={tag} size="sm" variant="neutral">
              {tag}
            </Tag>
          ))}
          {isOwner && <VisibilityTag visibility={listing.visibility} />}
        </>
      }
      action={
        isOwner && (
          <VisibilityToggle
            current={listing.visibility}
            id={listing.id}
            kind="api"
          />
        )
      }
    />
  );
}
