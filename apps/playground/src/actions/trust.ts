"use server";

import { revalidatePath } from "next/cache";
import * as v from "valibot";
import {
  FileReportSchema,
  type ReportReason,
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

const pathOf = ({ kind, username, ref }: ResourceRef): string =>
  kind === "listing" ? `/${username}/api/${ref}` : `/${username}/agents/${ref}`;

const resolveTarget = async (
  resource: ResourceRef,
): Promise<{ ownerId: string } | null> => {
  if (resource.kind === "listing") {
    return prisma.apiListing.findFirst({
      where: {
        id: resource.id,
        deletedAt: null,
        visibility: { in: ["PUBLIC", "UNLISTED"] },
      },
      select: { ownerId: true },
    });
  }

  const agent = await prisma.agent.findFirst({
    where: {
      id: resource.id,
      deletedAt: null,
      visibility: { in: ["PUBLIC", "UNLISTED"] },
    },
    select: { ownerId: true },
  });

  return agent?.ownerId ? { ownerId: agent.ownerId } : null;
};

export const submitReview = async (
  resource: ResourceRef,
  input: unknown,
): Promise<ActionResult> => {
  const viewer = await getViewer();

  if (!viewer) {
    return { ok: false, error: "unauthorized" };
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

  const where = {
    ...targetOf(resource.kind, resource.id),
    authorId: viewer.id,
  };
  const existing = await prisma.review.findFirst({
    where,
    select: { id: true },
  });

  if (existing) {
    await prisma.review.update({
      where: { id: existing.id },
      data: { ...parsed.output, verifiedPurchase },
    });
  } else {
    await prisma.review.create({
      data: {
        ...targetOf(resource.kind, resource.id),
        authorId: viewer.id,
        ...parsed.output,
        verifiedPurchase,
      },
    });
  }

  revalidatePath(pathOf(resource));

  return { ok: true };
};

export const deleteOwnReview = async (
  resource: ResourceRef,
): Promise<ActionResult> => {
  const viewer = await getViewer();

  if (!viewer) {
    return { ok: false, error: "unauthorized" };
  }

  await prisma.review.deleteMany({
    where: {
      ...targetOf(resource.kind, resource.id),
      authorId: viewer.id,
    },
  });

  revalidatePath(pathOf(resource));

  return { ok: true };
};

export const fileReport = async (
  resource: ResourceRef,
  input: unknown,
): Promise<ActionResult> => {
  const viewer = await getViewer();

  if (!viewer) {
    return { ok: false, error: "unauthorized" };
  }

  const parsed = v.safeParse(FileReportSchema, input);

  if (!parsed.success) {
    return { ok: false, error: "invalid_report" };
  }

  const target = await resolveTarget(resource);

  if (!target) {
    return { ok: false, error: "not_found" };
  }

  const open = await prisma.report.findFirst({
    where: {
      ...targetOf(resource.kind, resource.id),
      reporterId: viewer.id,
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
    },
    select: { id: true },
  });

  if (open) {
    return { ok: false, error: "already_reported" };
  }

  await prisma.report.create({
    data: {
      ...targetOf(resource.kind, resource.id),
      reporterId: viewer.id,
      reason: parsed.output.reason as ReportReason,
      detail: parsed.output.detail,
    },
  });

  return { ok: true };
};
