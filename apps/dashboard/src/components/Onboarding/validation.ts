import { isValidUsername, usernameUnavailableReason } from "@4mica/url";
import type { UsernameStatus } from "@stores/user/type";

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 120;

export const isNameValid = (name: string): boolean => {
  const trimmed = name.trim();
  return trimmed.length >= NAME_MIN_LENGTH && trimmed.length <= NAME_MAX_LENGTH;
};

export const isUsernameShapeValid = (username: string): boolean => {
  const candidate = username.trim().toLowerCase();
  return (
    isValidUsername(candidate) && usernameUnavailableReason(candidate) === null
  );
};

export const isUsernameValid = (
  username: string,
  status: UsernameStatus,
): boolean =>
  isUsernameShapeValid(username) &&
  status !== "checking" &&
  status !== "taken" &&
  status !== "reserved" &&
  status !== "blacklisted";

export const isBusinessValid = (legalName: string): boolean =>
  legalName.trim().length > 0;
