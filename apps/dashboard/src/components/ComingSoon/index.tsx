import { Sparkles } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

export function Placeholder({ className }: { className: string }) {
  return (
    <span className={`block h-2 rounded-full bg-overlay/10 ${className}`} />
  );
}

export function ComingSoon({
  title,
  description,
  children,
  "data-testid": testId,
}: {
  title: string;
  description: string;
  children: ReactNode;
  "data-testid"?: string;
}) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="relative mx-auto mt-8 w-full lg:max-w-3xl"
      data-testid={testId}
    >
      <div
        aria-hidden="true"
        inert
        className="pointer-events-none select-none opacity-50 [mask-image:linear-gradient(to_bottom,black_45%,transparent)]"
      >
        {children}
      </div>

      <div className="absolute inset-x-0 top-12 flex justify-center px-4">
        <div className="flex max-w-sm flex-col items-center gap-2 rounded-xl border border-overlay/10 bg-surface px-5 py-4 text-center shadow-lg">
          <span className="inline-flex items-center gap-1 rounded-full bg-overlay/10 px-2 py-0.5 font-medium text-ink-muted text-xs">
            <Sparkles aria-hidden="true" className="h-3 w-3" />
            {t("comingSoon.badge")}
          </span>
          <h2 id={titleId} className="font-semibold text-ink-strong text-sm">
            {title}
          </h2>
          <p className="text-ink-muted text-sm">{description}</p>
        </div>
      </div>
    </section>
  );
}
