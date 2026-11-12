const RESIZABLE_HOSTS = new Set(["img.clerk.com"]);

export const sizedAvatarUrl = (
  src: string | null | undefined,
  pixels: number,
): string | null => {
  if (!src) {
    return null;
  }

  try {
    const url = new URL(src);

    if (!RESIZABLE_HOSTS.has(url.hostname)) {
      return src;
    }

    url.searchParams.set("width", String(pixels));
    url.searchParams.set("height", String(pixels));
    url.searchParams.set("fit", "crop");

    return url.toString();
  } catch {
    return src;
  }
};
