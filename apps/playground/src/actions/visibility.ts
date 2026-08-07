"use server";

import { revalidatePath, updateTag } from "next/cache";
import { safeParam, VisibilitySchema } from "@/schema/params";
import { prisma } from "@/services/db";
import { getViewer } from "@/services/viewer";
import { type ActionResult, profileTag } from "./shared";

/**
 * Publish/unpublish toggles for the owner bar.
 *
 * Both actions load the row and compare its ownerId to the verified session
 * BEFORE updating. Filtering on `{ id, ownerId }` in the update itself would
 * also work, but loading first lets us distinguish "not yours" from "gone" and
 * keeps the check impossible to drop by accident. Never trust the id argument.
 */
const resolveOwner = async (): Promise<
  { ok: true; id: string; username: string | null } | { ok: false }
> => {
  const viewer = await getViewer();
  return viewer
    ? { ok: true, id: viewer.id, username: viewer.username }
    : { ok: false };
};

const revalidateOwner = (username: string | null): void => {
  if (!username) return;
  // Server-action context — see the note in actions/revalidate.ts.
  updateTag(profileTag(username));
  revalidatePath(`/${username}`, "layout");
};

export const setAgentVisibility = async (
  agentId: string,
  visibility: string,
): Promise<ActionResult> => {
  const parsed = safeParam(VisibilitySchema, visibility);

  if (!parsed) {
    return { ok: false, error: "invalid_visibility" };
  }

  const viewer = await resolveOwner();

  if (!viewer.ok) {
    return { ok: false, error: "unauthorized" };
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, ownerId: true },
  });

  if (!agent || agent.ownerId !== viewer.id) {
    // Same response for "missing" and "not yours" — a distinct 404 would let a
    // caller enumerate valid agent ids.
    return { ok: false, error: "not_found" };
  }

  await prisma.agent.update({
    where: { id: agent.id },
    data: { visibility: parsed },
  });

  revalidateOwner(viewer.username);

  return { ok: true };
};

export const setApiListingVisibility = async (
  listingId: string,
  visibility: string,
): Promise<ActionResult> => {
  const parsed = safeParam(VisibilitySchema, visibility);

  if (!parsed) {
    return { ok: false, error: "invalid_visibility" };
  }

  const viewer = await resolveOwner();

  if (!viewer.ok) {
    return { ok: false, error: "unauthorized" };
  }

  const listing = await prisma.apiListing.findUnique({
    where: { id: listingId },
    select: { id: true, ownerId: true, deletedAt: true },
  });

  if (!listing || listing.ownerId !== viewer.id || listing.deletedAt) {
    return { ok: false, error: "not_found" };
  }

  await prisma.apiListing.update({
    where: { id: listing.id },
    data: {
      visibility: parsed,
      publishedAt: parsed === "PUBLIC" ? new Date() : null,
    },
  });

  revalidateOwner(viewer.username);

  return { ok: true };
};
