import { config } from "@config/index";
import { createScopedLogger } from "@logger/index";

export interface PlaygroundResource {
  kind: "listing" | "agent";
  id: string;
}

export interface PlaygroundRevalidation {
  organizationId: string;
  usernames?: string[];
  resources?: PlaygroundResource[];
}

const REVALIDATE_TIMEOUT_MS = 2_000;

const logger = createScopedLogger("playground");

const failureReason = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause instanceof Error ? error.cause.message : "";

  return cause ? `${error.message}: ${cause}` : error.message;
};

export const revalidatePlayground = async (
  payload: PlaygroundRevalidation,
): Promise<boolean> => {
  const target = config.playground;

  if (!target) {
    return false;
  }

  try {
    const response = await fetch(`${target.url}/api/revalidate`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${target.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn("Playground refused the cache revalidation", {
        status: response.status,
        organizationId: payload.organizationId,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn("Could not reach the playground to revalidate its cache", {
      reason: failureReason(error),
      organizationId: payload.organizationId,
    });
    return false;
  }
};
