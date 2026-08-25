const EXPANDED = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
const FULL = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

/**
 * Convert a hex colour to an `rgba()` string. Returns undefined for anything
 * unparseable so callers can fall back to their variant colours.
 */
export const hexToRGBA = (hex: string, alpha = 1): string | undefined => {
  const short = EXPANDED.exec(hex);
  const normalised = short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
    : hex;

  const match = FULL.exec(normalised);
  if (!match) {
    return undefined;
  }

  const [r, g, b] = [match[1], match[2], match[3]].map((part) =>
    Number.parseInt(part, 16),
  );

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
