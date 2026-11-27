export const SOCIAL_IMAGE_PATH = "/og-image.jpg";

export function socialImageUrl(appUrl: string | undefined): string | null {
  const value = appUrl?.trim();
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return new URL(SOCIAL_IMAGE_PATH, url.origin).href;
  } catch {
    return null;
  }
}
