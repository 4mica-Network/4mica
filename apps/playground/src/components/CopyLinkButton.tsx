"use client";

import { Button } from "@4mica/ui";
import { Check, Link2 } from "lucide-react";
import { useState } from "react";
import { messages } from "@/i18n";

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <Button
      intent="outline"
      size="sm"
      onClick={copy}
      icon={
        copied ? (
          <Check aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Link2 aria-hidden="true" className="h-4 w-4" />
        )
      }
    >
      {copied ? messages.common.copied : messages.common.copyLink}
    </Button>
  );
}
