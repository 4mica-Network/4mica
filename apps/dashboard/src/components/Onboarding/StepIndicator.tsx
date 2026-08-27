import { cn } from "@4mica/ui";
import { useTranslation } from "react-i18next";

/**
 * Local to onboarding rather than in @4mica/ui: it has exactly one consumer,
 * and "completed / current / upcoming, cannot jump ahead" is wizard semantics,
 * not generic progress. Promote it when a second consumer shows up.
 */
export function StepIndicator({
  current,
  total,
}: {
  /** 0-based. */
  current: number;
  total: number;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      <ol className="flex flex-1 items-center gap-1.5">
        {Array.from({ length: total }, (_, index) => index).map((index) => (
          <li
            key={index}
            aria-current={index === current ? "step" : undefined}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              index < current && "bg-brand",
              index === current && "bg-ink-strong",
              index > current && "bg-overlay/10",
            )}
          />
        ))}
      </ol>

      <span className="shrink-0 text-ink-subtle text-xs tabular-nums">
        {t("onboarding.stepOf", { current: current + 1, total })}
      </span>
    </div>
  );
}
