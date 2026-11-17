import { HttpError } from "@4mica/http";
import i18n from "@i18n";

interface ApiIssue {
  path?: unknown;
  message?: unknown;
}

const isNumeric = (segment: string): boolean => /^\d+$/.test(segment);

const issuesOf = (error: unknown): { path: string; message: string }[] => {
  if (!(error instanceof HttpError)) {
    return [];
  }

  const issues = (error.body as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues)) {
    return [];
  }

  return (issues as ApiIssue[]).flatMap((issue) =>
    typeof issue?.path === "string" && typeof issue.message === "string"
      ? [{ path: issue.path, message: issue.message }]
      : [],
  );
};

const keysFor = (path: string): string[] => {
  const segments = path.split(".");
  const named = segments.filter((segment) => !isNumeric(segment));

  return [path, named.join("."), named.at(-1) ?? "", named[0] ?? ""];
};

export const toIssueMap = (error: unknown): Record<string, string> => {
  const map: Record<string, string> = {};

  for (const { path, message } of issuesOf(error)) {
    for (const key of keysFor(path)) {
      if (key !== "" && !(key in map)) {
        map[key] = message;
      }
    }
  }

  return map;
};

export const isNotFound = (error: unknown): boolean =>
  error instanceof HttpError && error.status === 404;

export const toMessage = (
  error: unknown,
  fallback: string,
  { sessionExpired }: { sessionExpired?: string } = {},
): string => {
  if (!(error instanceof HttpError)) {
    return fallback;
  }

  const code = (error.body as { error?: unknown } | null)?.error;

  if (error.status === 403 && code === "account_disabled") {
    return i18n.t("http.accountDisabled");
  }

  if (error.status === 429) {
    const seconds =
      error.retryAfterMs === null ? null : Math.ceil(error.retryAfterMs / 1000);
    return seconds && seconds > 0
      ? i18n.t("http.rateLimitedFor", { count: seconds })
      : i18n.t("http.rateLimited");
  }

  if (sessionExpired && (error.status === 401 || error.status === 403)) {
    return sessionExpired;
  }

  const body = error.body as { error?: unknown; message?: unknown } | null;
  const [first] = issuesOf(error);
  if (body?.error === "invalid_request" && first) {
    return first.path === "(root)"
      ? first.message
      : `${first.path}: ${first.message}`;
  }

  return typeof body?.message === "string" && body.message !== ""
    ? body.message
    : fallback;
};
