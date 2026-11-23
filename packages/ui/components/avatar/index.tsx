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

const PIXELS = { xs: 32, sm: 36, md: 48, lg: 64, xl: 96 } as const;

export interface AvatarProps extends VariantProps<typeof avatar> {
  src?: string | null;
  priority?: boolean;
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
  priority = false,
  className,
}: AvatarProps) {
  const base = cn(avatar({ size }), className);
  const pixels = PIXELS[size ?? "md"];

  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? name}
        className={cn(base, "object-cover")}
        width={pixels}
        height={pixels}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
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
