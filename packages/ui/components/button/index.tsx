import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../lib/cn";

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
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  className,
  intent,
  size,
  block,
  asChild = false,
  icon,
  iconPosition = "left",
  type = "button",
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
    <button type={type} className={classes} {...props}>
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
