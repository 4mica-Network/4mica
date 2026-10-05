import {
  createFaqHandler,
  deleteFaqHandler,
  getPolicyHandler,
  listFaqsHandler,
  listReportsHandler,
  listReviewsHandler,
  reorderFaqsHandler,
  replyToReviewHandler,
  trustSummaryHandler,
  updateFaqHandler,
  updateReportHandler,
  upsertPolicyHandler,
} from "@controllers/trust/index";
import type { ResourceKind } from "@controllers/trust/repository";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  errorResponseSchema,
  faqListResponseSchema,
  faqResponseSchema,
  limitedResponses,
  policyResponseSchema,
  reportListResponseSchema,
  reportResponseSchema,
  reviewListResponseSchema,
  reviewResponseSchema,
  trustSummaryResponseSchema,
} from "./schema-fragments";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
} as const;

const childParamSchema = (child: string) =>
  ({
    type: "object",
    required: ["id", child],
    properties: { id: { type: "string" }, [child]: { type: "string" } },
  }) as const;

const pageQuerySchema = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
  },
} as const;

const reportQuerySchema = {
  type: "object",
  properties: {
    ...pageQuerySchema.properties,
    status: {
      type: "string",
      enum: ["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"],
    },
  },
} as const;

const faqBodySchema = {
  type: "object",
  required: ["question", "answer"],
  properties: {
    question: { type: "string", maxLength: 280 },
    answer: { type: "string", maxLength: 2000 },
  },
} as const;

const reorderBodySchema = {
  type: "object",
  required: ["ids"],
  properties: {
    ids: { type: "array", items: { type: "string" }, maxItems: 100 },
  },
} as const;

const policyBodySchema = {
  type: "object",
  properties: {
    policyEnabled: { type: "boolean" },
    faqEnabled: { type: "boolean" },
    refundPolicy: { type: "string", nullable: true, maxLength: 2000 },
    uptimeTarget: { type: "string", nullable: true, maxLength: 120 },
    supportResponse: { type: "string", nullable: true, maxLength: 120 },
    supportEmail: { type: "string", nullable: true, maxLength: 320 },
    rateLimit: { type: "string", nullable: true, maxLength: 120 },
    dataRetention: { type: "string", nullable: true, maxLength: 2000 },
    testEndpoint: { type: "string", nullable: true, maxLength: 2048 },
    termsUrl: { type: "string", nullable: true, maxLength: 2048 },
    privacyUrl: { type: "string", nullable: true, maxLength: 2048 },
    statusUrl: { type: "string", nullable: true, maxLength: 2048 },
  },
} as const;

const replyBodySchema = {
  type: "object",
  required: ["reply"],
  properties: { reply: { type: "string", nullable: true, maxLength: 2000 } },
} as const;

const reportBodySchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", enum: ["ACKNOWLEDGED", "RESOLVED"] },
    resolutionNote: { type: "string", nullable: true, maxLength: 2000 },
  },
} as const;

interface Surface {
  kind: ResourceKind;
  prefix: string;
  tag: string;
  noun: string;
}

const SURFACES: Surface[] = [
  {
    kind: "listing",
    prefix: "/me/api-listings",
    tag: "api-listings",
    noun: "API listing",
  },
  { kind: "agent", prefix: "/me/agents", tag: "agents", noun: "agent" },
];

export const trustRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  for (const { kind, prefix, tag, noun } of SURFACES) {
    app.get(
      `${prefix}/:id/policy`,
      {
        ...base,
        schema: {
          tags: [tag],
          summary: `Read the published policy for one ${noun}`,
          security: [{ bearerAuth: [] }],
          params: idParamSchema,
          response: {
            200: policyResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            ...limitedResponses,
          },
        },
      },
      getPolicyHandler(kind),
    );

    app.put(
      `${prefix}/:id/policy`,
      {
        ...strict,
        schema: {
          tags: [tag],
          summary: `Create or replace the policy for one ${noun}`,
          security: [{ bearerAuth: [] }],
          params: idParamSchema,
          body: policyBodySchema,
          response: {
            200: policyResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            ...limitedResponses,
          },
        },
      },
      upsertPolicyHandler(kind),
    );

    app.get(
      `${prefix}/:id/trust`,
      {
        ...base,
        schema: {
          tags: [tag],
          summary: `Rating and report totals for one ${noun}`,
          security: [{ bearerAuth: [] }],
          params: idParamSchema,
          response: {
            200: trustSummaryResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            ...limitedResponses,
          },
        },
      },
      trustSummaryHandler(kind),
    );

    app.get(
      `${prefix}/:id/reviews`,
      {
        ...base,
        schema: {
          tags: [tag],
          summary: `List the reviews left on one ${noun}`,
          security: [{ bearerAuth: [] }],
          params: idParamSchema,
          querystring: pageQuerySchema,
          response: {
            200: reviewListResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            ...limitedResponses,
          },
        },
      },
      listReviewsHandler(kind),
    );

    app.post(
      `${prefix}/:id/reviews/:reviewId/reply`,
      {
        ...strict,
        schema: {
          tags: [tag],
          summary: "Answer a review in public",
          security: [{ bearerAuth: [] }],
          params: childParamSchema("reviewId"),
          body: replyBodySchema,
          response: {
            200: reviewResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            ...limitedResponses,
          },
        },
      },
      replyToReviewHandler(kind),
    );

    app.get(
      `${prefix}/:id/reports`,
      {
        ...base,
        schema: {
          tags: [tag],
          summary: `List the reports filed against one ${noun}`,
          security: [{ bearerAuth: [] }],
          params: idParamSchema,
          querystring: reportQuerySchema,
          response: {
            200: reportListResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            ...limitedResponses,
          },
        },
      },
      listReportsHandler(kind),
    );

    app.patch(
      `${prefix}/:id/reports/:reportId`,
      {
        ...strict,
        schema: {
          tags: [tag],
          summary: "Acknowledge or resolve a report",
          security: [{ bearerAuth: [] }],
          params: childParamSchema("reportId"),
          body: reportBodySchema,
          response: {
            200: reportResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            ...limitedResponses,
          },
        },
      },
      updateReportHandler(kind),
    );

    app.get(
      `${prefix}/:id/faqs`,
      {
        ...base,
        schema: {
          tags: [tag],
          summary: `List the published questions for one ${noun}`,
          security: [{ bearerAuth: [] }],
          params: idParamSchema,
          response: {
            200: faqListResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            ...limitedResponses,
          },
        },
      },
      listFaqsHandler(kind),
    );

    app.post(
      `${prefix}/:id/faqs`,
      {
        ...strict,
        schema: {
          tags: [tag],
          summary: "Add a question and answer",
          security: [{ bearerAuth: [] }],
          params: idParamSchema,
          body: faqBodySchema,
          response: {
            201: faqResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            ...limitedResponses,
          },
        },
      },
      createFaqHandler(kind),
    );

    app.put(
      `${prefix}/:id/faqs/order`,
      {
        ...strict,
        schema: {
          tags: [tag],
          summary: "Reorder the published questions",
          security: [{ bearerAuth: [] }],
          params: idParamSchema,
          body: reorderBodySchema,
          response: {
            200: faqListResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            ...limitedResponses,
          },
        },
      },
      reorderFaqsHandler(kind),
    );

    app.patch(
      `${prefix}/:id/faqs/:faqId`,
      {
        ...strict,
        schema: {
          tags: [tag],
          summary: "Edit a question",
          security: [{ bearerAuth: [] }],
          params: childParamSchema("faqId"),
          body: faqBodySchema,
          response: {
            200: faqResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            ...limitedResponses,
          },
        },
      },
      updateFaqHandler(kind),
    );

    app.delete(
      `${prefix}/:id/faqs/:faqId`,
      {
        ...strict,
        schema: {
          tags: [tag],
          summary: "Remove a question",
          security: [{ bearerAuth: [] }],
          params: childParamSchema("faqId"),
          response: {
            204: { type: "null" },
            401: errorResponseSchema,
            404: errorResponseSchema,
            ...limitedResponses,
          },
        },
      },
      deleteFaqHandler(kind),
    );
  }

  done();
};
