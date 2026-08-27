export type ComponentSize = "sm" | "md" | "lg";

const ICON_SIZES: Record<ComponentSize, number> = {
  sm: 12,
  md: 14,
  lg: 16,
};

export const getIconSize = (size?: ComponentSize | null): number =>
  ICON_SIZES[size ?? "md"];
