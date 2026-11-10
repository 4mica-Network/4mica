import { isValidUsername, usernameUnavailableReason } from "@4mica/url";

export const handleFromPath = (pathname: string | null): string | null => {
  const segments = (pathname ?? "").split("/").filter(Boolean);
  if (segments.length !== 1) {
    return null;
  }

  const handle = decodeURIComponent(segments[0]).toLowerCase();
  return isValidUsername(handle) && usernameUnavailableReason(handle) === null
    ? handle
    : null;
};
