"use client";

import { Button, Spinner } from "@4mica/ui";
import { EyeOff, RefreshCw, Settings } from "lucide-react";
import { useState, useTransition } from "react";
import { revalidateProfile } from "@/actions/revalidate";
import { messages } from "@/i18n";
import { links } from "@/services/links";

export interface OwnerBarProps {
  username: string;
  /** False while the profile is still private — drives the preview warning. */
  isPublished: boolean;
}

/**
 * Shown only when the verified session owns this profile. Editing lives in the
 * dashboard against the already-validated PATCH /me/profile — duplicating it
 * here would create a second write path for the same fields.
 */
export function OwnerBar({ username, isPublished }: OwnerBarProps) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const refresh = () => {
    startTransition(async () => {
      await revalidateProfile(username);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    });
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${
        isPublished
          ? "border-overlay/10 bg-overlay/5"
          : "border-warning/30 bg-warning/10"
      }`}
    >
      {!isPublished && (
        <EyeOff aria-hidden="true" className="h-4 w-4 shrink-0 text-warning" />
      )}

      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink-strong text-sm">
          {isPublished
            ? messages.owner.viewingOwn
            : messages.owner.previewTitle}
        </p>
        {!isPublished && (
          <p className="text-ink-muted text-sm">{messages.owner.previewLead}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          intent="ghost"
          size="sm"
          onClick={refresh}
          disabled={pending}
          icon={
            pending ? (
              <Spinner size="sm" />
            ) : (
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
            )
          }
        >
          {done ? messages.owner.refreshed : messages.owner.refreshAction}
        </Button>

        <Button
          intent="outline"
          size="sm"
          asChild
          icon={<Settings aria-hidden="true" className="h-4 w-4" />}
        >
          <a href={`${links.app}/settings/profile`}>
            {isPublished
              ? messages.owner.manageAction
              : messages.owner.publishAction}
          </a>
        </Button>
      </div>
    </div>
  );
}
