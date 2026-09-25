import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../button";

export interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
  labels?: {
    previous?: string;
    next?: string;
  };
  "data-testid"?: string;
}

export const Pagination = ({
  page,
  perPage,
  total,
  onPrev,
  onNext,
  className,
  labels,
  ...props
}: PaginationProps) => {
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  const maxPages = Math.max(Math.ceil(total / perPage), 1);

  const prefix = props["data-testid"]
    ? `${props["data-testid"]}-pagination`
    : "pagination";

  const atStart = page <= 1;
  const atEnd = page >= maxPages;

  return (
    <div
      className={cn("flex items-center gap-3", className)}
      data-testid={prefix}
    >
      <span className="text-ink-muted text-sm" data-testid={`${prefix}-range`}>
        {`${start}-${end} of ${total}`}
      </span>

      <div className="flex gap-2" data-testid={`${prefix}-controls`}>
        <Button
          type="button"
          intent="ghost"
          size="sm"
          aria-label={labels?.previous ?? "Previous page"}
          onClick={onPrev}
          disabled={atStart}
          className="btn-no-lift border border-overlay/10 px-2"
          data-testid={`${prefix}-prev`}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4",
              atStart ? "text-ink-subtle" : "text-ink-body",
            )}
          />
        </Button>

        <Button
          type="button"
          intent="ghost"
          size="sm"
          aria-label={labels?.next ?? "Next page"}
          onClick={onNext}
          disabled={atEnd}
          className="btn-no-lift border border-overlay/10 px-2"
          data-testid={`${prefix}-next`}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4",
              atEnd ? "text-ink-subtle" : "text-ink-body",
            )}
          />
        </Button>
      </div>
    </div>
  );
};
