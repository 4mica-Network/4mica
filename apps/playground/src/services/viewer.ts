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

export const getViewer = cache(async (): Promise<Viewer | null> => {
  let clerkUserId: string | null = null;

  try {
    ({ userId: clerkUserId } = await auth());
  } catch (error) {
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
