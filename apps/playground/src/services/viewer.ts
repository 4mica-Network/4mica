import "server-only";

import { auth } from "@clerk/nextjs/server";
import { cache } from "react";
import { appLogger } from "@/logger";
import type { SessionIdentity } from "@/types";
import { prisma } from "./db";

export interface Viewer {
  id: string;
  username: string | null;
  name: string;
  avatarUrl: string | null;
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

const firstNonBlank = (
  ...values: (string | null | undefined)[]
): string | null => values.find((value) => asString(value) !== null) ?? null;

/**
 * The signed-in user, or null. Ownership is always derived from the verified
 * Clerk session — never from a prop, a query param or a request body — so a
 * caller cannot claim to be someone else by editing a URL.
 *
 * Cached per request: the layout, the page and any server action all resolve
 * the viewer once.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  let clerkUserId: string | null = null;

  try {
    ({ userId: clerkUserId } = await auth());
  } catch (error) {
    // Auth here is OPTIONAL — it only decides whether an owner bar is shown.
    // A misconfigured secret or a Clerk outage makes auth() throw (e.g.
    // "Handshake token verification failed"), and letting that propagate would
    // take down a page that is meant to be readable by anyone. Degrade to
    // "signed out" instead.
    appLogger.warn("clerk session resolution failed; treating as signed out", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  if (!clerkUserId) {
    return null;
  }

  return prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true, username: true, name: true, avatarUrl: true },
  });
});

export const getSessionIdentity = cache(
  async (): Promise<SessionIdentity | null> => {
    let clerkUserId: string | null = null;
    let claims: Record<string, unknown> = {};

    try {
      const session = await auth();
      clerkUserId = session.userId;
      claims = (session.sessionClaims ?? {}) as Record<string, unknown>;
    } catch (error) {
      appLogger.warn(
        "clerk session resolution failed; treating as signed out",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return null;
    }

    if (!clerkUserId) {
      return null;
    }

    const viewer = await getViewer();

    return {
      name: firstNonBlank(viewer?.name, asString(claims.name)) ?? "",
      username: viewer?.username ?? null,
      avatarUrl:
        firstNonBlank(
          viewer?.avatarUrl,
          asString(claims.image),
          asString(claims.image_url),
        ) ?? null,
    };
  },
);
