import { cn } from "@4mica/ui";
import { Star } from "lucide-react";
import { RATING_MAX } from "@/schema/trust";

export interface StarsProps {
  value: number;
  size?: "sm" | "md";
  className?: string;
}

export function Stars({ value, size = "sm", className }: StarsProps) {
  const filled = Math.round(value);
  const box = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span
      aria-label={`${value.toFixed(1)} out of ${RATING_MAX}`}
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
    >
      {Array.from({ length: RATING_MAX }, (_, index) => (
        <Star
          aria-hidden="true"
          className={cn(
            box,
            index < filled
              ? "fill-warning text-warning"
              : "fill-transparent text-ink-subtle/50",
          )}
          key={`star-${index + 1}`}
        />
      ))}
    </span>
  );
}
