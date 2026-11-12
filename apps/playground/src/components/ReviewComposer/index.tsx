"use client";

import { Button, cn } from "@4mica/ui";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Star } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { deleteOwnReview, submitReview } from "@/actions/trust";
import { messages, t } from "@/i18n";
import { type PublicReview, RATING_MAX } from "@/schema/trust";
import { runAction } from "@/utils/runAction";

export interface ReviewComposerProps {
  resource: {
    kind: "listing" | "agent";
    id: string;
    username: string;
    ref: string;
  };
  existing: PublicReview | null;
  canReview: boolean;
  signInHref: string;
}

const ERRORS: Record<string, string> = {
  unauthorized: messages.trust.errorSignedOut,
  own_resource: messages.trust.errorOwnResource,
  invalid_review: messages.trust.errorInvalidReview,
  not_found: messages.trust.errorNotFound,
};

export function ReviewComposer({
  resource,
  existing,
  canReview,
  signInHref,
}: ReviewComposerProps) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hovered, setHovered] = useState(0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const reduceMotion = useReducedMotion();
  const firstStar = useRef<HTMLButtonElement>(null);

  if (!canReview) {
    return (
      <p className="text-ink-muted text-sm">
        {messages.trust.signInToReview}{" "}
        <a
          className="text-ink-strong underline underline-offset-2"
          href={signInHref}
        >
          {messages.auth.signIn}
        </a>
      </p>
    );
  }

  const shown = hovered || rating;

  const save = () => {
    setError(null);
    setSaved(false);

    if (rating < 1) {
      setError(messages.trust.errorNoRating);
      return;
    }

    startTransition(async () => {
      const result = await runAction(() =>
        submitReview(resource, { rating, title, body }),
      );

      if (result.ok) {
        setSaved(true);
        return;
      }

      setError(ERRORS[result.error ?? ""] ?? messages.trust.errorGeneric);
    });
  };

  const remove = () => {
    setError(null);

    startTransition(async () => {
      const result = await runAction(() => deleteOwnReview(resource));

      if (!result.ok) {
        setError(
          result.error === "not_found"
            ? messages.trust.errorDeleteMissing
            : (ERRORS[result.error ?? ""] ?? messages.trust.errorGeneric),
        );
        return;
      }

      setRating(0);
      setTitle("");
      setBody("");
      setSaved(false);
      firstStar.current?.focus();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <fieldset
        aria-label={messages.trust.ratingLabel}
        className="m-0 flex min-w-0 items-center gap-1"
      >
        {Array.from({ length: RATING_MAX }, (_, index) => {
          const score = index + 1;

          return (
            <m.button
              aria-label={t(messages.trust.rateN, { count: String(score) })}
              aria-pressed={score === rating}
              className="rounded p-0.5"
              key={score}
              onClick={() => setRating(score)}
              onHoverEnd={() => setHovered(0)}
              onHoverStart={() => setHovered(score)}
              ref={score === 1 ? firstStar : undefined}
              type="button"
              whileTap={reduceMotion ? undefined : { scale: 0.85 }}
            >
              <Star
                className={cn(
                  "h-5 w-5 transition-colors duration-150",
                  score <= shown
                    ? "fill-warning text-warning"
                    : "fill-transparent text-ink-subtle/60",
                )}
              />
            </m.button>
          );
        })}
      </fieldset>

      <input
        aria-label={messages.trust.titleLabel}
        className="w-full rounded-md border border-overlay/15 bg-transparent px-3 py-2 text-ink-body text-sm placeholder:text-ink-subtle"
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={messages.trust.titlePlaceholder}
        value={title}
      />

      <textarea
        aria-label={messages.trust.bodyLabel}
        className="w-full rounded-md border border-overlay/15 bg-transparent px-3 py-2 text-ink-body text-sm placeholder:text-ink-subtle"
        maxLength={2000}
        onChange={(event) => setBody(event.target.value)}
        placeholder={messages.trust.bodyPlaceholder}
        rows={3}
        value={body}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending} onClick={save} size="sm" type="button">
          {existing ? messages.trust.updateReview : messages.trust.postReview}
        </Button>

        {existing && (
          <Button
            disabled={pending}
            onClick={remove}
            size="sm"
            intent="ghost"
            type="button"
          >
            {messages.trust.deleteReview}
          </Button>
        )}

        <span role="status">
          <AnimatePresence>
            {saved && (
              <m.span
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-success"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0, y: 4 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
              >
                {messages.trust.saved}
              </m.span>
            )}
          </AnimatePresence>
        </span>
      </div>

      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
