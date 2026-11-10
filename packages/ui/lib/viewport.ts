export const VIEWPORT_PADDING = 8;

export type Side = "top" | "bottom" | "left" | "right";

export interface Point {
  top: number;
  left: number;
}

export interface Size {
  width: number;
  height: number;
}

export const oppositeSide: Record<Side, Side> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

export const sideOf = (placement: string): Side | null => {
  if (placement.startsWith("top")) return "top";
  if (placement.startsWith("bottom")) return "bottom";
  if (placement === "left" || placement === "right") return placement;
  return null;
};

export const spaceOnSide = (
  side: Side,
  anchor: DOMRect,
  padding = VIEWPORT_PADDING,
): number => {
  switch (side) {
    case "top":
      return anchor.top - padding;
    case "bottom":
      return window.innerHeight - anchor.bottom - padding;
    case "left":
      return anchor.left - padding;
    case "right":
      return window.innerWidth - anchor.right - padding;
  }
};

export const overflowsSide = (
  side: Side,
  point: Point,
  size: Size,
  padding = VIEWPORT_PADDING,
): boolean => {
  switch (side) {
    case "top":
      return point.top < padding;
    case "bottom":
      return point.top + size.height > window.innerHeight - padding;
    case "left":
      return point.left < padding;
    case "right":
      return point.left + size.width > window.innerWidth - padding;
  }
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

export const clampToViewport = (
  point: Point,
  size: Size,
  padding = VIEWPORT_PADDING,
): Point => ({
  top: clamp(point.top, padding, window.innerHeight - size.height - padding),
  left: clamp(point.left, padding, window.innerWidth - size.width - padding),
});
