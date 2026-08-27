"use client";

import { messages } from "@/i18n";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html className="dark" lang="en">
      <body className="min-h-screen bg-surface-deep text-ink-body antialiased">
        <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-5 px-6 text-center">
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
      </body>
    </html>
  );
}
