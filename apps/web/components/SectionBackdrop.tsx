import { cn } from "@4mica/ui";
import Image from "next/image";

type BackdropPosition = "right" | "left" | "top" | "background";

const LAYOUT: Record<BackdropPosition, { box: string; mask: string }> = {
  right: {
    box: "inset-y-0 right-0 w-2/3 sm:w-1/2",
    mask: "radial-gradient(85% 120% at 100% 50%, #000 0%, transparent 75%)",
  },
  left: {
    box: "inset-y-0 left-0 w-2/3 sm:w-1/2",
    mask: "radial-gradient(85% 120% at 0% 50%, #000 0%, transparent 75%)",
  },
  top: {
    box: "inset-x-0 top-0 h-2/3",
    mask: "radial-gradient(120% 85% at 50% 0%, #000 0%, transparent 75%)",
  },
  background: {
    box: "inset-0",
    mask: "radial-gradient(100% 100% at 50% 0%, #000 0%, transparent 72%)",
  },
};

type SectionBackdropProps = {
  src: string;
  position?: BackdropPosition;
  className?: string;
  mask?: string | null;
  overlay?: string;
};

export default function SectionBackdrop({
  src,
  position = "right",
  className,
  mask,
  overlay,
}: SectionBackdropProps) {
  const { box, mask: defaultMask } = LAYOUT[position];
  const maskValue = mask === undefined ? defaultMask : (mask ?? undefined);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute -z-10 opacity-30 dark:opacity-60",
        box,
        className,
      )}
      style={{ maskImage: maskValue, WebkitMaskImage: maskValue }}
    >
      <Image
        src={src}
        alt=""
        fill
        sizes="(max-width: 1024px) 100vw, 50vw"
        className="object-cover"
        loading="lazy"
      />
      {overlay ? <div className={cn("absolute inset-0", overlay)} /> : null}
    </div>
  );
}
