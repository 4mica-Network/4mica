import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { getIconSize } from "../../utils/getIconSize";
import { hexToRGBA } from "../../utils/hexToRGB";

const tag = cva(
  [
    "inline-flex",
    "items-center",
    "justify-center",
    "min-w-0",
    "max-w-full",
    "whitespace-nowrap",
    "select-none",
    "transition-colors",
    "duration-200",
    "focus:outline-none",
    "rounded-lg",
    "font-medium",
  ],
  {
    variants: {
      variant: {
        default: ["bg-brand/10", "text-brand"],
        neutral: ["bg-overlay/10", "text-ink-muted"],
        success: ["bg-success/15", "text-success"],
        warning: ["bg-warning/15", "text-warning"],
        error: ["bg-danger/15", "text-danger"],
      },
      size: {
        sm: ["text-xs", "py-1", "px-2", "rounded-md"],
        md: ["text-sm", "py-1.5", "px-2.5"],
        lg: ["text-sm", "py-2", "px-3"],
      },
      hasClose: {
        true: "pr-2",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      hasClose: false,
    },
  },
);

export interface TagProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tag> {
  children?: ReactNode;
  /** Hex colour that overrides the variant, tinted for the background. */
  color?: string;
  icon?: ReactNode;
  onClose?: () => void;
  "data-testid"?: string;
}

export const Tag = ({
  className,
  variant,
  size,
  hasClose,
  children,
  color,
  icon,
  onClose,
  ...props
}: TagProps) => {
  const backgroundColor = color ? hexToRGBA(color, 0.1) : undefined;
  const textAndBorderColor = backgroundColor ? color : undefined;

  const prefix = props["data-testid"] ? `${props["data-testid"]}-tag` : "tag";

  return (
    <span
      className={cn(tag({ variant, size, hasClose }), className)}
      style={{
        backgroundColor,
        color: textAndBorderColor,
        borderColor: textAndBorderColor,
      }}
      {...props}
      data-testid={prefix}
      data-variant={variant}
      data-size={size}
      data-has-close={hasClose ? "true" : "false"}
    >
      {icon && <span className="mr-1 flex shrink-0 items-center">{icon}</span>}
      <span className="min-w-0 truncate">{children}</span>
      {hasClose && onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Remove"
          className="ml-1 flex shrink-0 items-center rounded-full hover:bg-overlay/20"
          data-testid={`${prefix}-close`}
        >
          <X size={getIconSize(size)} />
        </button>
      )}
    </span>
  );
};

Tag.displayName = "Tag";

export default Tag;
