"use server";

import { revalidatePath } from "next/cache";
import * as v from "valibot";
import {
  FileReportSchema,
  type ReportReason,
  ResourceRefSchema,
  SubmitReviewSchema,
} from "@/schema/trust";
import { prisma } from "@/services/db";
import {
  hasSettledPayment,
  type ResourceKind,
  targetOf,
} from "@/services/trust";
import { getViewer } from "@/services/viewer";
import type { ActionResult } from "./shared";

interface ResourceRef {
  kind: ResourceKind;
  id: string;
  username: string;
  ref: string;
}

const parseResource = (resource: unknown): ResourceRef | null => {
  const parsed = v.safeParse(ResourceRefSchema, resource);
  return parsed.success ? parsed.output : null;
};

interface Target {
  ownerId: string;
  path: string | null;
}

const PUBLIC_VISIBILITY = { in: ["PUBLIC" as const, "UNLISTED" as const] };

const resolveTarget = async (
  resource: ResourceRef,
  { publicOnly = true }: { publicOnly?: boolean } = {},
): Promise<Target | null> => {
  const where = {
    id: resource.id,
    deletedAt: null,
    ...(publicOnly ? { visibility: PUBLIC_VISIBILITY } : {}),
  };
  const select = {
    ownerId: true,
    slug: true,
    owner: { select: { username: true } },
  } as const;

  if (resource.kind === "listing") {
    const listing = await prisma.apiListing.findFirst({ where, select });

    return listing
      ? {
          ownerId: listing.ownerId,
          path: listing.owner.username
            ? `/${listing.owner.username}/api/${listing.slug}`
            : null,
        }
      : null;
  }

  const agent = await prisma.agent.findFirst({ where, select });

  if (!agent?.ownerId) {
    return null;
  }

  return {
    ownerId: agent.ownerId,
    path: agent.owner?.username
      ? `/${agent.owner.username}/agents/${agent.slug ?? resource.id}`
      : null,
  };
};

const revalidateTarget = (target: Target): void => {
  if (target.path) {
    revalidatePath(target.path);
  }
};

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null
    ? (error as { code?: string }).code
    : undefined;

export const submitReview = async (
  ref: ResourceRef,
  input: unknown,
): Promise<ActionResult> => {
  const viewer = await getViewer();

  if (!viewer) {
    return { ok: false, error: "unauthorized" };
  }

  const resource = parseResource(ref);

  if (!resource) {
    return { ok: false, error: "not_found" };
  }

  const parsed = v.safeParse(SubmitReviewSchema, input);

  if (!parsed.success) {
    return { ok: false, error: "invalid_review" };
  }

  const target = await resolveTarget(resource);

  if (!target) {
    return { ok: false, error: "not_found" };
  }

  if (target.ownerId === viewer.id) {
    return { ok: false, error: "own_resource" };
  }

  const verifiedPurchase = await hasSettledPayment(
    resource.kind,
    resource.id,
    viewer.id,
  );

  const data = { ...parsed.output, verifiedPurchase };

  await prisma.review.upsert({
    where:
      resource.kind === "listing"
        ? {
            listingId_authorId: {
              listingId: resource.id,
              authorId: viewer.id,
            },
          }
        : {
            agentId_authorId: { agentId: resource.id, authorId: viewer.id },
          },
    update: data,
    create: {
      ...targetOf(resource.kind, resource.id),
      authorId: viewer.id,
      ...data,
    },
  });

  revalidateTarget(target);

  return { ok: true };
};

export const deleteOwnReview = async (
  ref: ResourceRef,
): Promise<ActionResult> => {
  const viewer = await getViewer();

  if (!viewer) {
    return { ok: false, error: "unauthorized" };
  }

  const resource = parseResource(ref);

  if (!resource) {
    return { ok: false, error: "not_found" };
  }

  const { count } = await prisma.review.deleteMany({
    where: {
      ...targetOf(resource.kind, resource.id),
      authorId: viewer.id,
    },
  });

  if (count === 0) {
    return { ok: false, error: "not_found" };
  }

  const target = await resolveTarget(resource, { publicOnly: false });

  if (target) {
    revalidateTarget(target);
  }

  return { ok: true };
};

export const fileReport = async (
  ref: ResourceRef,
  input: unknown,
): Promise<ActionResult> => {
  const viewer = await getViewer();

  if (!viewer) {
    return { ok: false, error: "unauthorized" };
  }

  const resource = parseResource(ref);

  if (!resource) {
    return { ok: false, error: "not_found" };
  }

  const parsed = v.safeParse(FileReportSchema, input);

  if (!parsed.success) {
    return { ok: false, error: "invalid_report" };
  }

  const target = await resolveTarget(resource);

  if (!target) {
    return { ok: false, error: "not_found" };
  }

  if (target.ownerId === viewer.id) {
    return { ok: false, error: "own_resource" };
  }

  try {
    const created = await prisma.$transaction(
      async (tx) => {
        const open = await tx.report.findFirst({
          where: {
            ...targetOf(resource.kind, resource.id),
            reporterId: viewer.id,
            status: { in: ["OPEN", "ACKNOWLEDGED"] },
          },
          select: { id: true },
        });

        if (open) {
          return false;
        }

        await tx.report.create({
          data: {
            ...targetOf(resource.kind, resource.id),
            reporterId: viewer.id,
            reason: parsed.output.reason as ReportReason,
            detail: parsed.output.detail,
          },
        });

        return true;
      },
      { isolationLevel: "Serializable" },
    );

    return created ? { ok: true } : { ok: false, error: "already_reported" };
  } catch (error) {
    if (errorCode(error) === "P2034") {
      return { ok: false, error: "already_reported" };
    }

    throw error;
  }
};
