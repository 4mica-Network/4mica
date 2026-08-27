import Image from "next/image";

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

export default function AuthorAvatar({
  name,
  src,
  size = 28,
}: {
  name: string;
  src?: string;
  size?: number;
}) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-overlay/15 bg-overlay/[0.06]"
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="font-medium text-ink-muted leading-none"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {initialsOf(name)}
        </span>
      )}
    </span>
  );
}
