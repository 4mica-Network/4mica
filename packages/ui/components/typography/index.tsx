import { cva, type VariantProps } from "class-variance-authority";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Link } from "../link";

const typography = cva("", {
  variants: {
    variant: {
      heading: "font-display font-semibold text-ink-strong tracking-tight",
      default: "text-ink-body",
      subtle: "text-ink-muted",
      link: "inline-flex items-center gap-1",
    },
    size: {
      "2xs": "text-2xs",
      xs: "text-xs",
      sm: "text-sm",
      md: "text-md",
      lg: "text-lg",
      xl: "text-xl",
      "2xl": "text-2xl",
      "3xl": "text-3xl",
    },
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
  },
  defaultVariants: { variant: "default", size: "sm" },
});

export type TypographyElement =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "p"
  | "span"
  | "div"
  | "label"
  | "strong"
  | "em";

type TypographyStyleProps = Omit<VariantProps<typeof typography>, "variant">;

export interface TypographyTextProps
  extends TypographyStyleProps,
    Omit<HTMLAttributes<HTMLElement>, "color"> {
  variant?: "heading" | "default" | "subtle";
  as?: TypographyElement;
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export interface TypographyLinkProps
  extends TypographyStyleProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "color"> {
  variant: "link";
  href: string;
  tone?: "accent" | "muted";
  external?: boolean;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export type TypographyProps = TypographyTextProps | TypographyLinkProps;

const testIdPrefix = (value: string | undefined) =>
  value ? `${value}-typography` : "typography";

export function Typography(props: TypographyProps) {
  if (props.variant === "link") {
    const {
      className,
      size,
      weight,
      href,
      tone,
      external,
      icon,
      iconPosition,
      children,
      variant: _variant,
      ...rest
    } = props;
    const prefix = testIdPrefix(props["data-testid"]);

    return (
      <Link
        className={cn(typography({ variant: "link", size, weight }), className)}
        variant={tone}
        href={href}
        external={external}
        icon={icon}
        iconPosition={iconPosition}
        {...rest}
        data-testid={prefix}
        data-variant="link"
        data-size={size}
      >
        {children}
      </Link>
    );
  }

  const {
    className,
    variant = "default",
    size,
    weight,
    as,
    children,
    ...rest
  } = props;
  const prefix = testIdPrefix(props["data-testid"]);
  const Element = as ?? (variant === "heading" ? "h3" : "p");

  return (
    <Element
      className={cn(typography({ variant, size, weight }), className)}
      {...rest}
      data-testid={prefix}
      data-variant={variant}
      data-size={size}
    >
      {children}
    </Element>
  );
}

Typography.displayName = "Typography";
