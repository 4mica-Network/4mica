import type { ProjectPermission } from "@auth/permissions";
import type { ProjectScope } from "@auth/project";
import { MAX_OFFSET } from "@controllers/schema-primitives";
import {
  auditProject,
  invalidBody,
  notFound,
  parseBody,
  requireProject,
} from "@controllers/shared";
import type { RouteHandler } from "fastify";
import {
  createFaq,
  deleteFaq,
  findFaq,
  findReport,
  findReview,
  getPolicy,
  listFaqs,
  listReports,
  listReviews,
  ownsResource,
  type ResourceKind,
  reorderFaqs,
  replyToReview,
  trustSummary,
  updateFaq,
  updateReport,
  upsertPolicy,
} from "./repository";
import {
  FaqItemSchema,
  ListReportsQuerySchema,
  ListReviewsQuerySchema,
  ReorderFaqsSchema,
  ReplyToReviewSchema,
  UpdateReportSchema,
  UpsertPolicySchema,
} from "./schema";

const what = (kind: ResourceKind) =>
  kind === "listing" ? "API listing" : "agent";

const withOwnedResource =
  (
    kind: ResourceKind,
    permission: ProjectPermission,
    run: (
      id: string,
      request: Parameters<RouteHandler>[0],
      reply: Parameters<RouteHandler>[1],
      scope: ProjectScope,
    ) => Promise<unknown>,
  ): RouteHandler =>
  async (request, reply) => {
    const scope = await requireProject(request, reply, permission);
    if (!scope) {
      return reply;
    }

    const { id } = request.params as { id: string };

    if (!(await ownsResource(kind, scope, id))) {
      return notFound(reply, what(kind));
    }

    return run(id, request, reply, scope);
  };

const auditTarget = (kind: ResourceKind) =>
  kind === "listing" ? "api_listing" : "agent";

export const getPolicyHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, "resources.read", async (id, _request, reply) =>
    reply.send({ policy: await getPolicy(kind, id) }),
  );

export const upsertPolicyHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(
    kind,
    "resources.write",
    async (id, request, reply, scope) => {
      const parsed = parseBody(UpsertPolicySchema, request.body);
      if (!parsed.success) {
        return invalidBody(reply, parsed.issues);
      }

      const policy = await upsertPolicy(kind, id, parsed.data);
      await auditProject(request, scope, {
        action: "resource_policy.updated",
        targetType: auditTarget(kind),
        targetId: id,
      });

      return reply.send({ policy });
    },
  );

export const trustSummaryHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, "resources.read", async (id, _request, reply) =>
    reply.send(await trustSummary(kind, id)),
  );

export const listReviewsHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, "resources.read", async (id, request, reply) => {
    const parsed = parseBody(ListReviewsQuerySchema, request.query);
    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
    }

    if ((parsed.data.page - 1) * parsed.data.limit > MAX_OFFSET) {
      return invalidBody(reply, [
        { path: "page", message: "is beyond the last page" },
      ]);
    }

    return reply.send(await listReviews(kind, id, parsed.data));
  });

export const replyToReviewHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(
    kind,
    "resources.write",
    async (id, request, reply, scope) => {
      const parsed = parseBody(ReplyToReviewSchema, request.body);
      if (!parsed.success) {
        return invalidBody(reply, parsed.issues);
      }

      const { reviewId } = request.params as { reviewId: string };
      const review = await findReview(kind, id, reviewId);

      if (!review) {
        return notFound(reply, "review");
      }

      const updated = await replyToReview(review.id, parsed.data.reply);
      await auditProject(request, scope, {
        action: "review.replied",
        targetType: "review",
        targetId: review.id,
        metadata: { [kind === "listing" ? "listingId" : "agentId"]: id },
      });

      return reply.send({ review: updated });
    },
  );

export const listReportsHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, "resources.read", async (id, request, reply) => {
    const parsed = parseBody(ListReportsQuerySchema, request.query);
    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
    }

    if ((parsed.data.page - 1) * parsed.data.limit > MAX_OFFSET) {
      return invalidBody(reply, [
        { path: "page", message: "is beyond the last page" },
      ]);
    }

    return reply.send(await listReports(kind, id, parsed.data));
  });

export const updateReportHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(
    kind,
    "resources.write",
    async (id, request, reply, scope) => {
      const parsed = parseBody(UpdateReportSchema, request.body);
      if (!parsed.success) {
        return invalidBody(reply, parsed.issues);
      }

      const { reportId } = request.params as { reportId: string };
      const report = await findReport(kind, id, reportId);

      if (!report) {
        return notFound(reply, "report");
      }

      const updated = await updateReport(
        report.id,
        parsed.data.status,
        parsed.data.resolutionNote,
      );
      await auditProject(request, scope, {
        action: "report.updated",
        targetType: "report",
        targetId: report.id,
        metadata: { status: parsed.data.status },
      });

      return reply.send({ report: updated });
    },
  );

export const listFaqsHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, "resources.read", async (id, _request, reply) =>
    reply.send({ data: await listFaqs(kind, id) }),
  );

export const createFaqHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, "resources.write", async (id, request, reply) => {
    const parsed = parseBody(FaqItemSchema, request.body);
    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
    }

    return reply
      .code(201)
      .send({ faq: await createFaq(kind, id, parsed.data) });
  });

export const updateFaqHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, "resources.write", async (id, request, reply) => {
    const parsed = parseBody(FaqItemSchema, request.body);
    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
    }

    const { faqId } = request.params as { faqId: string };
    const faq = await findFaq(kind, id, faqId);

    if (!faq) {
      return notFound(reply, "question");
    }

    return reply.send({ faq: await updateFaq(faq.id, parsed.data) });
  });

export const deleteFaqHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, "resources.write", async (id, request, reply) => {
    const { faqId } = request.params as { faqId: string };
    const faq = await findFaq(kind, id, faqId);

    if (!faq) {
      return notFound(reply, "question");
    }

    await deleteFaq(faq.id);

    return reply.code(204).send();
  });

export const reorderFaqsHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, "resources.write", async (id, request, reply) => {
    const parsed = parseBody(ReorderFaqsSchema, request.body);
    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
    }

    return reply.send({ data: await reorderFaqs(kind, id, parsed.data.ids) });
  });
