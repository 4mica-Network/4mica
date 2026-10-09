import { Button, EmptyState, InputField, Tag } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { replyToReview, trustPendingKeys } from "@stores/trust/actions";
import {
  selectIsTrustPending,
  selectReviews,
  selectTrustError,
  selectTrustIssues,
  selectTrustSummary,
} from "@stores/trust/selector";
import type { Review } from "@stores/trust/type";
import { formatDate } from "@utils/format";
import { MessageSquare, Star } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOnSuccess } from "@/hooks/useOnSuccess";
import { useReturnFocus } from "@/hooks/useReturnFocus";

const Stars = ({ value }: { value: number }) => (
  <span className="inline-flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((score) => (
      <Star
        className={
          score <= value
            ? "h-3.5 w-3.5 fill-warning text-warning"
            : "h-3.5 w-3.5 fill-transparent text-ink-subtle/50"
        }
        key={score}
      />
    ))}
  </span>
);

function ReviewRow({
  review,
  kind,
  id,
}: {
  review: Review;
  kind: "listing" | "agent";
  id: string;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isPending = useAppSelector(
    selectIsTrustPending(trustPendingKeys.review(review.id)),
  );

  const error = useAppSelector(selectTrustError);
  const issues = useAppSelector(selectTrustIssues);

  const [open, setOpen] = useState(false);
  const replyButton = useReturnFocus(open);
  const [reply, setReply] = useState(review.ownerReply ?? "");
  const [attempted, setAttempted] = useState(false);

  useOnSuccess(isPending, error !== null, () => {
    setAttempted(false);
    setOpen(false);
  });

  const send = () => {
    if (isPending) {
      return;
    }
    setAttempted(true);
    dispatch(replyToReview({ kind, id }, review.id, reply.trim() || null));
  };

  return (
    <li className="flex flex-col gap-2 border-overlay/10 border-b py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Stars value={review.rating} />
        <span className="font-medium text-ink-strong text-sm">
          {review.author.username
            ? `@${review.author.username}`
            : review.author.name}
        </span>
        {review.verifiedPurchase && (
          <Tag size="sm" variant="success">
            {t("appDetail.verifiedPurchase")}
          </Tag>
        )}
        <span className="ml-auto text-ink-subtle text-xs">
          {formatDate(review.createdAt)}
        </span>
      </div>

      {review.title && (
        <p className="font-medium text-ink-strong text-sm">{review.title}</p>
      )}
      {review.body && (
        <p className="whitespace-pre-line text-ink-body text-sm">
          {review.body}
        </p>
      )}

      {review.ownerReply && !open && (
        <div className="border-overlay/15 border-l-2 pl-3">
          <p className="text-ink-subtle text-xs">{t("appDetail.yourReply")}</p>
          <p className="whitespace-pre-line text-ink-body text-sm">
            {review.ownerReply}
          </p>
        </div>
      )}

      {open ? (
        <div className="flex flex-col gap-2">
          <InputField
            aria-label={t("appDetail.replyLabel")}
            autoFocus
            spellCheck
            error={attempted && !isPending ? issues.reply : undefined}
            maxLength={2000}
            onChange={(event) => setReply(event.target.value)}
            placeholder={t("appDetail.replyPlaceholder")}
            rows={3}
            value={reply}
            variant="textarea"
          />
          <div className="flex gap-2">
            <Button disabled={isPending} onClick={send} size="sm">
              {t("appDetail.postReply")}
            </Button>
            <Button intent="ghost" onClick={() => setOpen(false)} size="sm">
              {t("appDetail.cancelReply")}
            </Button>
          </div>
        </div>
      ) : (
        <button
          ref={replyButton}
          className="inline-flex items-center gap-1.5 self-start text-ink-subtle text-sm transition-colors hover:text-ink-body"
          onClick={() => setOpen(true)}
          type="button"
        >
          <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
          {review.ownerReply ? t("appDetail.editReply") : t("appDetail.reply")}
        </button>
      )}
    </li>
  );
}

export function ReviewsPanel({
  kind,
  id,
}: {
  kind: "listing" | "agent";
  id: string;
}) {
  const { t } = useTranslation();
  const reviews = useAppSelector(selectReviews);
  const summary = useAppSelector(selectTrustSummary);

  if (reviews.length === 0) {
    return (
      <EmptyState
        description={t("appDetail.noReviewsBody")}
        icon={<Star className="h-5 w-5" />}
        title={t("appDetail.noReviews")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {summary && (
        <p className="text-ink-muted text-sm">
          {t("appDetail.reviewSummary", {
            average: (summary.ratingAverage ?? 0).toFixed(1),
            count: summary.ratingCount,
            unanswered: summary.unansweredReviews,
          })}
        </p>
      )}

      <ul className="flex flex-col border-overlay/10 border-t">
        {reviews.map((review) => (
          <ReviewRow id={id} key={review.id} kind={kind} review={review} />
        ))}
      </ul>
    </div>
  );
}
