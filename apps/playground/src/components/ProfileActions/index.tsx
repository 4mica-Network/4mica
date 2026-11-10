"use client";

import { Link2, Share2 } from "lucide-react";
import { ActionGroup, copyText } from "@/components/ActionGroup";
import { messages } from "@/i18n";

export interface ProfileActionsProps {
  url: string;
  title: string;
  label?: string;
}

export function ProfileActions({
  url,
  title,
  label = messages.profile.actions,
}: ProfileActionsProps) {
  const share = async (): Promise<string | null> => {
    if (typeof navigator.share !== "function") {
      return copyText(url, messages.profile.linkCopied);
    }

    try {
      await navigator.share({ title, url });
    } catch {
      return null;
    }
    return messages.profile.shared;
  };

  return (
    <ActionGroup
      iconOnly
      label={label}
      size="md"
      actions={[
        {
          id: "copy",
          label: messages.profile.copyLink,
          icon: Link2,
          run: () => copyText(url, messages.profile.linkCopied),
        },
        {
          id: "share",
          label: messages.profile.share,
          icon: Share2,
          run: share,
        },
      ]}
    />
  );
}
