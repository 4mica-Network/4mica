import {
  isValidUsername,
  USERNAME_MAX_LENGTH,
  usernameUnavailableReason,
} from "@4mica/url";

export type HandleProblem = "invalid" | "reserved" | "blacklisted";

const PROBLEM_KEYS: Record<HandleProblem, string> = {
  invalid: "organization.create.handleInvalid",
  reserved: "organization.create.handleReserved",
  blacklisted: "organization.create.handleBlacklisted",
};

export const handleProblem = (handle: string): HandleProblem | null =>
  isValidUsername(handle) ? usernameUnavailableReason(handle) : "invalid";

export const handleProblemKey = (handle: string): string | null => {
  const problem = handleProblem(handle);
  return problem ? PROBLEM_KEYS[problem] : null;
};

export const suggestHandle = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
