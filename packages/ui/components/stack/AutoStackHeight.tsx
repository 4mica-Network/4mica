import { type ReactNode, useEffect, useRef, useState } from "react";
import { Stack, type StackProps } from "./index";

export interface AutoStackHeightProps<T extends { id: string | number }>
  extends Pick<
    StackProps,
    "direction" | "growth" | "depthFactor" | "minScale" | "className"
  > {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  offsetPerItem?: number;
  width?: number | string;
  "data-testid"?: string;
}

export function AutoStackHeight<T extends { id: string | number }>({
  items,
  renderItem,
  offsetPerItem = 8,
  direction,
  growth = "down",
  depthFactor,
  minScale,
  width = "220px",
  className,
  ...props
}: AutoStackHeightProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState<number>();

  // Measures the TALLEST card, not the first. Cards are absolutely positioned,
  // so anything taller than the reserved height overflows and paints over
  // whatever follows in the sidebar. Card heights differ whenever some carry
  // media and some do not, and `direction="top"` means the front card is the
  // last item — so the first card is never a safe proxy.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const cards = () =>
      Array.from(node.querySelectorAll<HTMLElement>("[data-stack-card]"));

    const measure = () => {
      const tallest = cards().reduce(
        (max, card) => Math.max(max, card.offsetHeight),
        0,
      );
      setCardHeight((prev) => (prev === tallest ? prev : tallest));
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    for (const card of cards()) {
      observer.observe(card);
    }
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  const reserved = Math.max(items.length - 1, 0) * offsetPerItem;
  const height = cardHeight === undefined ? undefined : cardHeight + reserved;

  const prefix = props["data-testid"]
    ? `${props["data-testid"]}-auto-stack`
    : "auto-stack";

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height,
        width: typeof width === "number" ? `${width}px` : width,
        paddingTop: growth === "up" ? reserved : undefined,
        // Hidden, not unmounted, until the first measurement lands: the cards
        // still need layout to be measurable, but an unsized container is a
        // zero-height one, which would overlap its siblings for a frame.
        visibility: cardHeight === undefined ? "hidden" : undefined,
      }}
      data-testid={prefix}
    >
      <Stack
        data-testid={props["data-testid"]}
        direction={direction}
        growth={growth}
        offset={offsetPerItem}
        depthFactor={depthFactor}
        minScale={minScale}
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            data-stack-card=""
            data-testid={`${prefix}-card-${index}`}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </Stack>
    </div>
  );
}

AutoStackHeight.displayName = "AutoStackHeight";
