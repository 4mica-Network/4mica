"use client";

import { Spinner } from "@4mica/ui";
import { EyeOff, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { revalidateProfile } from "@/actions/revalidate";
import { messages } from "@/i18n";
import { links } from "@/services/links";
import { runAction } from "@/utils/runAction";

export interface OwnerBarProps {
  username: string;
}

export function OwnerBar({ username }: OwnerBarProps) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "done" | "failed">("idle");

  const refresh = () => {
    startTransition(async () => {
      const result = await runAction(() => revalidateProfile(username));
      setStatus(result.ok ? "done" : "failed");
      setTimeout(() => setStatus("idle"), 1500);
    });
  };

  const refreshLabel =
    status === "done"
      ? messages.owner.refreshed
      : status === "failed"
        ? messages.owner.refreshFailed
        : messages.owner.refreshAction;

  return (
    <div className="flex justify-center max-md:mx-4 max-md:mt-3 max-md:mb-1">
      <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-overlay/10 py-1 pr-1 pl-3 text-xs">
        <EyeOff
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-warning"
        />
        <span className="truncate text-ink-body">
          {messages.owner.previewTitle}
        </span>
        <span aria-hidden="true" className="h-3 w-px shrink-0 bg-overlay/15" />
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          aria-label={refreshLabel}
          title={refreshLabel}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-overlay/10 hover:text-ink-strong disabled:cursor-wait"
        >
          {pending ? (
            <Spinner size="sm" />
          ) : (
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          )}
        </button>
        <a
          href={`${links.app}/settings/profile`}
          className="inline-flex h-6 shrink-0 items-center rounded-full px-2.5 font-medium text-ink-strong transition-colors hover:bg-overlay/10"
        >
          {messages.owner.publishAction}
        </a>
      </div>
      <span className="sr-only" aria-live="polite">
        {status === "idle" ? "" : refreshLabel}
      </span>
    </div>
  );
}
