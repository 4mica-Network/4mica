"use client";

import { cn, Spinner } from "@4mica/ui";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useState, useTransition } from "react";
import {
  setAgentVisibility,
  setApiListingVisibility,
} from "@/actions/visibility";
import { messages } from "@/i18n";
import type { Visibility } from "@/types";

const OPTIONS = [
  { value: "PUBLIC", label: messages.visibility.public, icon: Eye },
  { value: "UNLISTED", label: messages.visibility.unlisted, icon: EyeOff },
  { value: "PRIVATE", label: messages.visibility.private, icon: Lock },
] as const;

export interface VisibilityToggleProps {
  kind: "agent" | "api";
  id: string;
  current: Visibility;
}

export function VisibilityToggle({ kind, id, current }: VisibilityToggleProps) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<Visibility>(current);
  const [error, setError] = useState<string | null>(null);

  const change = (next: Visibility) => {
    if (next === value || pending) return;

    const previous = value;
    setValue(next); // optimistic
    setError(null);

    startTransition(async () => {
      const result =
        kind === "agent"
          ? await setAgentVisibility(id, next)
          : await setApiListingVisibility(id, next);

      if (!result.ok) {
        setValue(previous); // roll back
        setError(result.error ?? "failed");
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div
        className="inline-flex items-center gap-0.5 rounded-md border border-overlay/10 p-0.5"
        role="group"
      >
        {pending && <Spinner size="sm" />}
        {OPTIONS.map(({ value: option, label, icon: Icon }) => (
          <button
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
              value === option
                ? "bg-overlay/10 text-ink-strong"
                : "text-ink-subtle hover:text-ink-body",
            )}
            disabled={pending}
            key={option}
            onClick={(event) => {
              // The card is wrapped in a link.
              event.preventDefault();
              event.stopPropagation();
              change(option);
            }}
            type="button"
          >
            <Icon aria-hidden="true" className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}
