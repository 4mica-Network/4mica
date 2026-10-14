import { cn } from "@4mica/ui";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  testId: string;
}) {
  return (
    <fieldset
      aria-label={label}
      className="m-0 inline-flex min-w-0 shrink-0 items-center gap-0.5 rounded-lg border border-overlay/10 bg-overlay/5 p-0.5"
      data-testid={testId}
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-overlay/40",
              active
                ? "bg-overlay/10 text-ink-strong shadow-sm"
                : "text-ink-subtle hover:text-ink-body",
            )}
            data-testid={`${testId}-${option.value}`}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
