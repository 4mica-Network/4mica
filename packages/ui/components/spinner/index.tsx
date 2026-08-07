import { cn } from "../../lib/cn";

export type SpinnerSize = "sm" | "md" | "lg" | "xl";

export interface SpinnerProps {
  className?: string;
  size?: SpinnerSize;
  title?: string;
  "data-testid"?: string;
}

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
  xl: "h-8 w-8",
};

export const Spinner = ({
  className,
  size = "md",
  title = "Loading...",
  ...props
}: SpinnerProps) => {
  const prefix = props["data-testid"]
    ? `${props["data-testid"]}-spinner`
    : "spinner";

  return (
    <div
      {...props}
      className={cn("inline-flex items-center justify-center", className)}
      role="status"
      aria-label={title}
      data-testid={prefix}
    >
      <svg
        className={cn("animate-spin text-current", SIZE_CLASSES[size])}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        data-testid={`${prefix}-icon`}
      >
        <title>{title}</title>
        <circle
          className="opacity-25"
          stroke="currentColor"
          strokeWidth="4"
          cx="12"
          cy="12"
          r="10"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
};

Spinner.displayName = "Spinner";
