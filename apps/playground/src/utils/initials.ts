/** Up to two initials for the avatar fallback. Falls back to the handle. */
export const initials = (name: string, username: string): string => {
  const source = name.trim() || username;
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};
