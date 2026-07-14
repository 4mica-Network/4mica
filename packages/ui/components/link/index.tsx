import { cva, type VariantProps } from "class-variance-authority";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * Link is a typed wrapper over the canonical `.link-*` design-system classes
 * defined in `@4mica/tailwind-config` (styles.css). Framework-agnostic: renders
 * a plain `<a>`. For client-side routing, wrap it with a router `Link` via a
 * `Button asChild` or pass an `href`.
 */
const link = cva("cursor-pointer", {
  variants: {
    variant: {
      accent: "link-accent",
      muted: "link-muted",
    },
  },
  defaultVariants: {
    variant: "accent",
  },
});

export interface LinkProps
  extends AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof link> {
  /** Optional leading/trailing icon. Icon-agnostic — pass any ReactNode. */
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  /** Opens in a new tab with safe `rel`. */
  external?: boolean;
}

export function Link({
  className,
  variant,
  icon,
  iconPosition = "right",
  external = false,
  children,
  ...props
}: LinkProps) {
  const externalProps = external
    ? { target: "_blank", rel: "noreferrer noopener" }
    : {};

  return (
    <a
      className={cn(link({ variant }), className)}
      {...externalProps}
      {...props}
    >
      {icon && iconPosition === "left" && (
        <span className="mr-1 inline-flex shrink-0 align-middle">{icon}</span>
      )}
      {children}
      {icon && iconPosition === "right" && (
        <span className="ml-1 inline-flex shrink-0 align-middle">{icon}</span>
      )}
    </a>
  );
}
