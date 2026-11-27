import { Tag } from "@4mica/ui";
import { CircleAlert, EyeOff, Lock } from "lucide-react";
import { messages } from "@/i18n";
import type { Visibility } from "@/types";

export interface VisibilityTagProps {
  visibility: Visibility;
  complete?: boolean;
}

export function VisibilityTag({
  visibility,
  complete = true,
}: VisibilityTagProps) {
  if (!complete) {
    return (
      <Tag
        size="sm"
        variant="warning"
        icon={<CircleAlert aria-hidden="true" className="h-3 w-3" />}
        title={messages.visibility.incompleteHint}
      >
        {messages.visibility.incomplete}
      </Tag>
    );
  }

  if (visibility === "PUBLIC") {
    return null;
  }

  const unlisted = visibility === "UNLISTED";

  return (
    <Tag
      size="sm"
      variant={unlisted ? "warning" : "neutral"}
      icon={
        unlisted ? (
          <EyeOff aria-hidden="true" className="h-3 w-3" />
        ) : (
          <Lock aria-hidden="true" className="h-3 w-3" />
        )
      }
      title={
        unlisted
          ? messages.visibility.unlistedHint
          : messages.visibility.privateHint
      }
    >
      {unlisted ? messages.visibility.unlisted : messages.visibility.private}
    </Tag>
  );
}
