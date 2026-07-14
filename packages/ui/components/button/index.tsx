import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * Button is a typed wrapper over the canonical `.btn-*` design-system classes
 * defined in `@4mica/tailwind-config` (styles.css). It adds zero new CSS while
 * guaranteeing visual parity with the rest of the app.
 */
const button = cva("btn", {
  variants: {
    intent: {
      primary: "btn-primary",
      outline: "btn-outline",
      soft: "btn-soft",
      ghost: "btn-ghost",
      invert: "btn-invert",
    },
    size: {
      sm: "btn-sm",
      md: "btn-md",
      lg: "btn-lg",
    },
    block: {
      true: "w-full",
    },
  },
  defaultVariants: {
    intent: "primary",
    size: "md",
  },
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  /** Optional leading/trailing icon. Icon-agnostic — pass any ReactNode. */
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  /**
   * Render the child element instead of a `<button>`, forwarding all classes
   * (e.g. an `<a>` or a Next `<Link>`). Icon props are ignored in this mode —
   * compose the child's content yourself.
   */
  asChild?: boolean;
}

export function Button({
  className,
  intent,
  size,
  block,
  asChild = false,
  icon,
  iconPosition = "left",
  children,
  ...props
}: ButtonProps) {
  const classes = cn(button({ intent, size, block }), className);

  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button className={classes} {...props}>
      {icon && iconPosition === "left" && (
        <span className="inline-flex shrink-0">{icon}</span>
      )}
      {children}
      {icon && iconPosition === "right" && (
        <span className="inline-flex shrink-0">{icon}</span>
      )}
    </button>
  );
}
