import { cva, type VariantProps } from "class-variance-authority";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

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
  icon?: ReactNode;
  iconPosition?: "left" | "right";
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
