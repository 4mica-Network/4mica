import { Tag } from "@4mica/ui";
import { BadgeCheck, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { Stars } from "@/components/Stars";
import { messages, t } from "@/i18n";
import type { PublicReview } from "@/schema/trust";
import { formatDate } from "@/utils/formatDate";

export interface ReviewListProps {
  reviews: PublicReview[];
  ownerName: string;
}

export function ReviewList({ reviews, ownerName }: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        description={messages.trust.noReviewsBody}
        icon={<MessageSquare className="h-4 w-4" />}
        title={messages.trust.noReviews}
      />
    );
  }

  return (
    <ul className="flex flex-col border-overlay/10 border-t">
      {reviews.map((review) => (
        <li
          className="flex flex-col gap-2 border-overlay/10 border-b py-4"
          key={review.id}
        >
          <div className="flex items-center gap-2.5">
            <Avatar
              name={review.authorName}
              size="sm"
              src={review.authorAvatarUrl}
              username={review.authorUsername ?? review.authorId}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-ink-strong text-sm">
                  {review.authorUsername
                    ? `@${review.authorUsername}`
                    : review.authorName}
                </span>
                {review.verifiedPurchase && (
                  <Tag size="sm" variant="success">
                    <BadgeCheck aria-hidden="true" className="mr-1 h-3 w-3" />
                    {messages.trust.verifiedPurchase}
                  </Tag>
                )}
              </div>
              <span className="text-ink-subtle text-xs">
                {formatDate(review.createdAt)}
              </span>
            </div>
            <Stars value={review.rating} />
          </div>

          {review.title && (
            <p className="font-medium text-ink-strong text-sm">
              {review.title}
            </p>
          )}

          {review.body && (
            <p className="whitespace-pre-line text-ink-body text-sm leading-relaxed">
              {review.body}
            </p>
          )}

          {review.ownerReply && (
            <div className="mt-1 border-overlay/15 border-l-2 pl-3">
              <p className="text-ink-subtle text-xs">
                {t(messages.trust.ownerReplied, { name: ownerName })}
              </p>
              <p className="whitespace-pre-line text-ink-body text-sm leading-relaxed">
                {review.ownerReply}
              </p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
