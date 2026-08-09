import { cn } from "@4mica/ui";
import { initials } from "@/utils/initials";

const SIZES = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-20 w-20 text-xl sm:h-24 sm:w-24 sm:text-2xl",
} as const;

export interface AvatarProps {
  src: string | null;
  name: string;
  username: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function Avatar({
  src,
  name,
  username,
  size = "md",
  className,
}: AvatarProps) {
  const base = cn(
    "profile-avatar grid shrink-0 place-items-center overflow-hidden rounded-full border border-overlay/10 font-semibold text-ink-strong",
    SIZES[size],
    className,
  );

  if (src) {
    return (
      // biome-ignore lint/performance/noImgElement: arbitrary remote hosts.
      <img
        src={src}
        alt={`${name || username}'s avatar`}
        className={cn(base, "object-cover")}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <span aria-hidden="true" className={base}>
      {initials(name, username)}
    </span>
  );
}
