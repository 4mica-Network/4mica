import { MAX_OFFSET } from "@controllers/schema-primitives";
import {
  invalidBody,
  notFound,
  parseBody,
  requireUserId,
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
    run: (
      id: string,
      request: Parameters<RouteHandler>[0],
      reply: Parameters<RouteHandler>[1],
    ) => Promise<unknown>,
  ): RouteHandler =>
  async (request, reply) => {
    const userId = requireUserId(request, reply);
    if (!userId) {
      return reply;
    }

    const { id } = request.params as { id: string };

    if (!(await ownsResource(kind, userId, id))) {
      return notFound(reply, what(kind));
    }

    return run(id, request, reply);
  };

export const getPolicyHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, async (id, _request, reply) =>
    reply.send({ policy: await getPolicy(kind, id) }),
  );

export const upsertPolicyHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, async (id, request, reply) => {
    const parsed = parseBody(UpsertPolicySchema, request.body);
    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
    }

    return reply.send({ policy: await upsertPolicy(kind, id, parsed.data) });
  });

export const trustSummaryHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, async (id, _request, reply) =>
    reply.send(await trustSummary(kind, id)),
  );

export const listReviewsHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, async (id, request, reply) => {
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
  withOwnedResource(kind, async (id, request, reply) => {
    const parsed = parseBody(ReplyToReviewSchema, request.body);
    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
    }

    const { reviewId } = request.params as { reviewId: string };
    const review = await findReview(kind, id, reviewId);

    if (!review) {
      return notFound(reply, "review");
    }

    return reply.send({
      review: await replyToReview(review.id, parsed.data.reply),
    });
  });

export const listReportsHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, async (id, request, reply) => {
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
  withOwnedResource(kind, async (id, request, reply) => {
    const parsed = parseBody(UpdateReportSchema, request.body);
    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
    }

    const { reportId } = request.params as { reportId: string };
    const report = await findReport(kind, id, reportId);

    if (!report) {
      return notFound(reply, "report");
    }

    return reply.send({
      report: await updateReport(
        report.id,
        parsed.data.status,
        parsed.data.resolutionNote,
      ),
    });
  });

export const listFaqsHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, async (id, _request, reply) =>
    reply.send({ data: await listFaqs(kind, id) }),
  );

export const createFaqHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, async (id, request, reply) => {
    const parsed = parseBody(FaqItemSchema, request.body);
    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
    }

    return reply
      .code(201)
      .send({ faq: await createFaq(kind, id, parsed.data) });
  });

export const updateFaqHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, async (id, request, reply) => {
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
  withOwnedResource(kind, async (id, request, reply) => {
    const { faqId } = request.params as { faqId: string };
    const faq = await findFaq(kind, id, faqId);

    if (!faq) {
      return notFound(reply, "question");
    }

    await deleteFaq(faq.id);

    return reply.code(204).send();
  });

export const reorderFaqsHandler = (kind: ResourceKind): RouteHandler =>
  withOwnedResource(kind, async (id, request, reply) => {
    const parsed = parseBody(ReorderFaqsSchema, request.body);
    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
    }

    return reply.send({ data: await reorderFaqs(kind, id, parsed.data.ids) });
  });
