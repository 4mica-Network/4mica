import { isGeneratedUsername } from "@4mica/url";
import type { User } from "@stores/user/type";

export const isProfileRenderable = (user: User | null): boolean =>
  user !== null &&
  user.username !== null &&
  user.banned === false &&
  user.hidden === false &&
  user.private === false;

export type ProfileHiddenReason =
  | "no-username"
  | "private"
  | "hidden"
  | "banned";

export const profileHiddenReason = (
  user: User | null,
): ProfileHiddenReason | null => {
  if (!user) {
    return "no-username";
  }
  if (user.username === null) {
    return "no-username";
  }
  if (user.banned) {
    return "banned";
  }
  if (user.private) {
    return "private";
  }
  if (user.hidden) {
    return "hidden";
  }
  return null;
};

export const hasGeneratedHandle = (user: User | null): boolean =>
  user?.username != null && isGeneratedUsername(user.username);
