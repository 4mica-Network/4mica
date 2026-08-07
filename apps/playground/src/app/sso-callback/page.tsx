"use client";

import { Spinner } from "@4mica/ui";
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { messages } from "@/i18n";

/**
 * OAuth landing route. Clerk finishes the handshake and redirects; this page
 * only exists to render something while it does.
 */
export default function SsoCallbackPage() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-ink-muted text-sm">{messages.common.loading}</p>
      </div>
      <AuthenticateWithRedirectCallback />
    </main>
  );
}
