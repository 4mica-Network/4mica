import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
import { initials } from "../../utils/initials";

const avatar = cva(
  "grid shrink-0 place-items-center overflow-hidden rounded-full border border-overlay/10 font-semibold text-ink-strong",
  {
    variants: {
      size: {
        xs: "h-8 w-8 text-sm",
        sm: "h-9 w-9 text-xs",
        md: "h-12 w-12 text-sm",
        lg: "h-16 w-16 text-lg",
        xl: "h-20 w-20 text-xl sm:h-24 sm:w-24 sm:text-2xl",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export interface AvatarProps extends VariantProps<typeof avatar> {
  src?: string | null;
  name: string;
  fallback?: string;
  alt?: string;
  className?: string;
}

export function Avatar({
  src,
  name,
  fallback,
  alt,
  size,
  className,
}: AvatarProps) {
  const base = cn(avatar({ size }), className);

  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? name}
        className={cn(base, "object-cover")}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <span aria-hidden="true" className={base}>
      {initials(name, fallback)}
    </span>
  );
}
