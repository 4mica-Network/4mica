import { Card, Tag } from "@4mica/ui";
import Link from "next/link";
import { VisibilityToggle } from "@/components/VisibilityToggle";
import type { PublicApiListing } from "@/types";
import { apiListingPath } from "@/utils/profileUrl";

export interface ApiListingCardProps {
  listing: PublicApiListing;
  username: string;
  isOwner: boolean;
}

export function ApiListingCard({
  listing,
  username,
  isOwner,
}: ApiListingCardProps) {
  return (
    <div className="flex flex-col">
      <Link
        className="rounded-lg transition-colors hover:bg-overlay/5 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        href={apiListingPath(username, listing.ref)}
      >
        <Card className="h-full gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-ink-strong">
              {listing.name}
            </h3>
            {listing.category && (
              <Tag size="sm" variant="neutral">
                {listing.category}
              </Tag>
            )}
          </div>

          {listing.summary && (
            <p className="line-clamp-2 text-ink-muted text-sm">
              {listing.summary}
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            {listing.tags.slice(0, 4).map((tag) => (
              <Tag key={tag} size="sm">
                {tag}
              </Tag>
            ))}
            {listing.priceLabel && (
              <span className="ml-auto text-ink-subtle text-xs">
                {listing.priceLabel}
              </span>
            )}
          </div>
        </Card>
      </Link>

      {isOwner && (
        <div className="px-6 pt-2">
          <VisibilityToggle
            current={listing.visibility}
            id={listing.id}
            kind="api"
          />
        </div>
      )}
    </div>
  );
}
