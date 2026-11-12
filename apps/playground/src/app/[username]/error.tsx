"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { messages } from "@/i18n";

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-5 px-6 py-20 text-center">
      <h1 className="font-semibold text-2xl text-ink-strong">
        {messages.errors.genericTitle}
      </h1>
      <p className="text-ink-muted">{messages.errors.genericLead}</p>

      {error.digest && (
        <p className="font-mono text-ink-subtle text-xs">
          Reference: {error.digest}
        </p>
      )}

      <div className="flex justify-center gap-3">
        <button
          className="btn btn-outline btn-sm"
          onClick={reset}
          type="button"
        >
          {messages.errors.retry}
        </button>
        <a className="btn btn-ghost btn-sm" href="/">
          {messages.errors.home}
        </a>
      </div>
    </main>
  );
}
