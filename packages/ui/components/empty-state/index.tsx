import { cva, type VariantProps } from "class-variance-authority";
import { isValidElement, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Button } from "../button";

const emptyState = cva(
  "flex flex-col items-center justify-center text-center",
  {
    variants: {
      variant: {
        card: "rounded-xl border border-overlay/10 bg-surface",
        // Borderless, for use inside a container that already draws its own
        // border — two nested frames read as a rendering bug.
        plain: "",
      },
      size: {
        sm: "px-4 py-6",
        md: "px-6 py-10",
      },
    },
    defaultVariants: { variant: "card", size: "md" },
  },
);

/** A label plus a click handler; rendered as the standard invert Button. */
export type EmptyStateAction = { label: string; onClick: () => void };

export interface EmptyStateProps extends VariantProps<typeof emptyState> {
  title: string;
  description?: string;
  icon?: ReactNode;
  /**
   * Object form for client callbacks. Pass a ReactNode instead (a link, say)
   * from a Server Component, where a function prop is not allowed.
   */
  action?: EmptyStateAction | ReactNode;
  className?: string;
  "data-testid"?: string;
}

function isCallbackAction(
  action: EmptyStateAction | ReactNode,
): action is EmptyStateAction {
  return (
    typeof action === "object" &&
    action !== null &&
    !isValidElement(action) &&
    "onClick" in action
  );
}

/**
 * The placeholder a collection shows when it has nothing to list. Hook-free on
 * purpose: it renders from Server Components, and a `use*` identifier here
 * would stamp `"use client"` on the barrel chunk.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  variant,
  size,
  className,
  ...props
}: EmptyStateProps) {
  const prefix = props["data-testid"]
    ? `${props["data-testid"]}-empty-state`
    : "empty-state";

  return (
    <div
      className={cn(emptyState({ variant, size }), className)}
      data-testid={prefix}
    >
      {icon && (
        <div className="mb-3 text-ink-muted" data-testid={`${prefix}-icon`}>
          {icon}
        </div>
      )}

      <div
        className="font-medium text-ink-strong text-sm"
        data-testid={`${prefix}-title`}
      >
        {title}
      </div>

      {description && (
        <p
          className="mt-1 max-w-[560px] text-ink-muted text-sm"
          data-testid={`${prefix}-description`}
        >
          {description}
        </p>
      )}

      {action ? (
        <div className="mt-6" data-testid={`${prefix}-action`}>
          {isCallbackAction(action) ? (
            <Button
              size="sm"
              intent="invert"
              onClick={action.onClick}
              data-testid={`${prefix}-action-button`}
            >
              {action.label}
            </Button>
          ) : (
            action
          )}
        </div>
      ) : null}
    </div>
  );
}
