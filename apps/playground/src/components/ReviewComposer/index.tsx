"use client";

import { Button, cn } from "@4mica/ui";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Star } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteOwnReview, submitReview } from "@/actions/trust";
import { messages, t } from "@/i18n";
import { type PublicReview, RATING_MAX } from "@/schema/trust";

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
      const result = await submitReview(resource, { rating, title, body });

      if (result.ok) {
        setSaved(true);
        return;
      }

      setError(ERRORS[result.error ?? ""] ?? messages.trust.errorGeneric);
    });
  };

  const remove = () => {
    startTransition(async () => {
      await deleteOwnReview(resource);
      setRating(0);
      setTitle("");
      setBody("");
      setSaved(false);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        {Array.from({ length: RATING_MAX }, (_, index) => {
          const score = index + 1;

          return (
            <motion.button
              aria-label={t(messages.trust.rateN, { count: String(score) })}
              className="rounded p-0.5 outline-none"
              key={score}
              onBlur={() => setHovered(0)}
              onClick={() => setRating(score)}
              onFocus={() => setHovered(score)}
              onHoverEnd={() => setHovered(0)}
              onHoverStart={() => setHovered(score)}
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
            </motion.button>
          );
        })}
      </div>

      <input
        className="w-full rounded-md border border-overlay/15 bg-transparent px-3 py-2 text-ink-body text-sm outline-none placeholder:text-ink-subtle focus:border-overlay/30"
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={messages.trust.titlePlaceholder}
        value={title}
      />

      <textarea
        className="w-full rounded-md border border-overlay/15 bg-transparent px-3 py-2 text-ink-body text-sm outline-none placeholder:text-ink-subtle focus:border-overlay/30"
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

        <AnimatePresence>
          {saved && (
            <motion.span
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-success"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0, y: 4 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
            >
              {messages.trust.saved}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
}
