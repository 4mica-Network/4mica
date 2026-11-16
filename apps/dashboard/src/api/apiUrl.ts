const TRUSTED_API_DOMAIN = "4mica.io";
export const LOCAL_API_URL = "http://localhost:4000";

const isTrustedHost = (hostname: string): boolean =>
  hostname === TRUSTED_API_DOMAIN ||
  hostname.endsWith(`.${TRUSTED_API_DOMAIN}`);

export function requireTrustedApiUrl(raw: string | undefined): string {
  const value = raw?.trim() ?? "";

  if (!value) {
    throw new Error("VITE_API_URL is required for a production build.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("VITE_API_URL must be an absolute URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("VITE_API_URL must use https in a production build.");
  }
  if (!isTrustedHost(url.hostname)) {
    throw new Error(
      `VITE_API_URL must be ${TRUSTED_API_DOMAIN} or one of its subdomains.`,
    );
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error(
      "VITE_API_URL must be a bare origin without credentials, path, query or hash.",
    );
  }

  return url.origin;
}
