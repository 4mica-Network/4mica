import { Star } from "lucide-react";
import { cn } from "../../lib/cn";

export interface StarsProps {
  value: number;
  max?: number;
  size?: "sm" | "md";
  label?: string;
  className?: string;
}

export function Stars({
  value,
  max = 5,
  size = "sm",
  label,
  className,
}: StarsProps) {
  const filled = Math.round(value);
  const box = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span
      aria-label={label ?? `${value.toFixed(1)} out of ${max}`}
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
    >
      {Array.from({ length: max }, (_, index) => index + 1).map((score) => (
        <Star
          aria-hidden="true"
          className={cn(
            box,
            score <= filled
              ? "fill-warning text-warning"
              : "fill-transparent text-ink-subtle/50",
          )}
          key={score}
        />
      ))}
    </span>
  );
}
