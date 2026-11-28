import { authenticateApiKey } from "@auth/api-key";
import { GOVERNED_ACTIONS } from "@controllers/approvals/governance";
import {
  cancelApprovalHandler,
  createSellerApprovalHandler,
  decideApprovalHandler,
  getApprovalHandler,
  getGovernanceHandler,
  getSellerApprovalHandler,
  listApprovalsHandler,
  updateGovernanceHandler,
} from "@controllers/approvals/index";
import {
  APPROVAL_KINDS,
  APPROVAL_PAGE_MAX,
  APPROVAL_STATUSES,
  APPROVAL_VOTES,
} from "@controllers/approvals/schema";
import { apiKeyRateLimit, sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  errorResponseSchema,
  idParam,
  limitedResponses,
} from "./schema-fragments";

const str = { type: "string" } as const;
const nullableStr = { type: ["string", "null"] } as const;
const int = { type: "integer" } as const;
const dateTime = { type: "string", format: "date-time" } as const;
const nullableDateTime = {
  type: ["string", "null"],
  format: "date-time",
} as const;
const status = { type: "string", enum: APPROVAL_STATUSES } as const;
const person = {
  type: ["object", "null"],
  properties: { id: str, name: str },
} as const;

const approvalSchema = {
  type: "object",
  required: ["id", "kind", "action", "status", "canDecide"],
  properties: {
    id: str,
    kind: { type: "string", enum: APPROVAL_KINDS },
    action: str,
    summary: str,
    payload: {},
    status,
    requiredApprovals: int,
    approvals: int,
    decisions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          user: person,
          vote: { type: "string", enum: APPROVAL_VOTES },
          comment: nullableStr,
          createdAt: dateTime,
        },
      },
    },
    requestedBy: person,
    requestedByApiKeyId: nullableStr,
    projectId: nullableStr,
    expiresAt: dateTime,
    createdAt: dateTime,
    decidedAt: nullableDateTime,
    executedAt: nullableDateTime,
    canDecide: { type: "boolean" },
  },
} as const;

const sellerApprovalSchema = {
  type: "object",
  required: ["id", "status", "expiresAt"],
  properties: {
    id: str,
    status,
    expiresAt: dateTime,
    decidedAt: nullableDateTime,
  },
} as const;

const governanceSchema = {
  type: "object",
  required: [
    "approvalsRequired",
    "governedActions",
    "approvalTtlHours",
    "financeRecipientIds",
    "auditRetentionDays",
  ],
  properties: {
    approvalsRequired: int,
    governedActions: {
      type: "array",
      items: { type: "string", enum: GOVERNED_ACTIONS },
    },
    approvalTtlHours: int,
    financeRecipientIds: { type: "array", items: str },
    auditRetentionDays: { type: ["integer", "null"] },
  },
} as const;

const idParams = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
} as const;

const errors = {
  ...limitedResponses,
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
} as const;

const doc = (summary: string, response: Record<number, unknown>) => ({
  tags: ["approvals"],
  summary,
  security: [{ bearerAuth: [] }],
  response: { ...errors, ...response },
});

export const approvalRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);
  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };
  const apiKey = {
    onRequest: [authenticateApiKey],
    preHandler: [apiKeyRateLimit(app)],
  };

  app.get(
    "/me/approvals",
    {
      ...base,
      schema: {
        ...doc("Approval requests in the active organization", {
          200: {
            type: "object",
            properties: {
              items: { type: "array", items: approvalSchema },
              nextCursor: nullableStr,
            },
          },
        }),
        querystring: {
          type: "object",
          properties: {
            status,
            kind: { type: "string", enum: APPROVAL_KINDS },
            cursor: str,
            limit: { type: "integer", minimum: 1, maximum: APPROVAL_PAGE_MAX },
          },
        },
      },
    },
    listApprovalsHandler,
  );

  app.get(
    "/me/approvals/:id",
    {
      ...base,
      schema: {
        ...doc("One approval request", { 200: approvalSchema }),
        params: idParams,
      },
    },
    getApprovalHandler,
  );

  app.post(
    "/me/approvals/:id/decide",
    {
      ...strict,
      schema: {
        ...doc("Approve or reject a request someone else made", {
          200: approvalSchema,
        }),
        params: idParams,
      },
    },
    decideApprovalHandler,
  );

  app.post(
    "/me/approvals/:id/cancel",
    {
      ...strict,
      schema: {
        ...doc("Withdraw a pending request you made", { 200: approvalSchema }),
        params: idParams,
      },
    },
    cancelApprovalHandler,
  );

  app.get(
    "/me/organization/governance",
    {
      ...base,
      schema: doc("The active organization's approval rules", {
        200: governanceSchema,
      }),
    },
    getGovernanceHandler,
  );

  app.put(
    "/me/organization/governance",
    {
      ...strict,
      schema: doc("Change the active organization's approval rules", {
        200: governanceSchema,
      }),
    },
    updateGovernanceHandler,
  );

  app.post(
    "/v1/approvals",
    {
      ...apiKey,
      schema: {
        tags: ["approvals"],
        summary: "Ask the organization to approve a buyer's payment",
        description:
          "Opens a seller-payment approval request. Once it is approved, pass its id as `approvalRequestId` to `POST /v1/customers/resolve` for the same payer, network and amount.",
        security: [{ apiKeyAuth: [] }],
        response: { ...errors, 201: sellerApprovalSchema },
      },
    },
    createSellerApprovalHandler,
  );

  app.get(
    "/v1/approvals/:id",
    {
      ...apiKey,
      schema: {
        tags: ["approvals"],
        summary: "Where a seller-payment approval request stands",
        security: [{ apiKeyAuth: [] }],
        params: idParams,
        response: { ...errors, 200: sellerApprovalSchema },
      },
    },
    getSellerApprovalHandler,
  );

  done();
};
