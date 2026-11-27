import {
  createSpendingPolicyHandler,
  deleteSpendingPolicyHandler,
  freezeSpendingPolicyHandler,
  listSpendingPoliciesHandler,
  unfreezeSpendingPolicyHandler,
  updateSpendingPolicyHandler,
} from "@controllers/spending-policies/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  errorResponseSchema,
  idParam,
  limitedResponses,
} from "./schema-fragments";

const str = { type: "string" } as const;
const nullStr = { type: "string", nullable: true } as const;
const date = { type: "string", format: "date-time" } as const;
const scopes = ["ORGANIZATION", "PROJECT", "AGENT", "API_KEY"];
const modes = ["ENFORCE", "MONITOR"];
const networks = ["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"];

const policySchema = {
  type: "object",
  required: ["id", "name", "scope", "mode", "frozen", "enabled"],
  properties: {
    id: str,
    name: str,
    scope: { type: "string", enum: scopes },
    projectId: nullStr,
    agentId: nullStr,
    apiKeyId: nullStr,
    mode: { type: "string", enum: modes },
    network: { type: "string", nullable: true, enum: [...networks, null] },
    assetAddress: nullStr,
    perPaymentLimit: nullStr,
    dailyLimit: nullStr,
    monthlyLimit: nullStr,
    approvalThreshold: nullStr,
    approvalsRequired: { type: "integer" },
    allowedRecipients: { type: "array", items: str },
    alertThresholds: { type: "array", items: { type: "integer" } },
    frozen: { type: "boolean" },
    frozenAt: { ...date, nullable: true },
    enabled: { type: "boolean" },
    createdAt: date,
    updatedAt: date,
    createdBy: {
      type: "object",
      nullable: true,
      properties: { id: str, name: str },
    },
    usage: {
      type: "object",
      nullable: true,
      properties: {
        asset: {
          type: "object",
          properties: { network: str, assetAddress: nullStr },
        },
        spentToday: str,
        spentThisMonth: str,
        reserved: str,
      },
    },
  },
} as const;

const approvalRequiredSchema = {
  type: "object",
  required: ["status", "message"],
  properties: {
    status: str,
    message: str,
    approvalRequest: {
      type: "object",
      additionalProperties: true,
      properties: {
        id: str,
        kind: str,
        action: str,
        summary: str,
        status: str,
        requiredApprovals: { type: "integer" },
        expiresAt: date,
        createdAt: date,
      },
    },
  },
} as const;

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
} as const;

const writeResponses = {
  ...limitedResponses,
  202: approvalRequiredSchema,
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
} as const;

const governedNote =
  "Governed by `spending_policy.change`: when governance requires approval this answers 202 with an approval request; repeat the same request with `X-Approval-Id` once it is approved.";

export const spendingPolicyRoutes: FastifyPluginCallback = (
  app,
  _opts,
  done,
) => {
  const base = guards(app);
  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  app.get(
    "/me/spending-policies",
    {
      ...base,
      schema: {
        tags: ["spending-policies"],
        summary: "List spending policies with their current usage",
        description:
          "Usage windows are UTC days and months. Reservations and pending approvals count until they expire; reported payments from your wallets that match no authorization count toward organization and agent policies.",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            scope: { type: "string", enum: scopes },
            projectId: { type: "string", maxLength: 64 },
            mode: { type: "string", enum: modes },
          },
        },
        response: {
          ...limitedResponses,
          200: {
            type: "object",
            required: ["items"],
            properties: { items: { type: "array", items: policySchema } },
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    listSpendingPoliciesHandler,
  );

  app.post(
    "/me/spending-policies",
    {
      ...strict,
      schema: {
        tags: ["spending-policies"],
        summary: "Create a spending policy",
        description: `Limits are checked by agents that call /v1/spend/authorize before paying; they are not enforced on payments made without asking. ${governedNote}`,
        security: [{ bearerAuth: [] }],
        response: { ...writeResponses, 201: policySchema },
      },
    },
    createSpendingPolicyHandler,
  );

  app.patch(
    "/me/spending-policies/:id",
    {
      ...strict,
      schema: {
        tags: ["spending-policies"],
        summary: "Change a spending policy",
        description: `Scope and target cannot change. ${governedNote}`,
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { ...writeResponses, 200: policySchema },
      },
    },
    updateSpendingPolicyHandler,
  );

  app.delete(
    "/me/spending-policies/:id",
    {
      ...strict,
      schema: {
        tags: ["spending-policies"],
        summary: "Delete a spending policy",
        description: governedNote,
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { ...writeResponses, 204: { type: "null" } },
      },
    },
    deleteSpendingPolicyHandler,
  );

  app.post(
    "/me/spending-policies/:id/freeze",
    {
      ...strict,
      schema: {
        tags: ["spending-policies"],
        summary: "Freeze a policy: deny every authorization it covers",
        description:
          "Takes effect immediately and is never held for approval, so it can be used in an emergency.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { ...writeResponses, 200: policySchema },
      },
    },
    freezeSpendingPolicyHandler,
  );

  app.post(
    "/me/spending-policies/:id/unfreeze",
    {
      ...strict,
      schema: {
        tags: ["spending-policies"],
        summary: "Unfreeze a policy",
        description: governedNote,
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: { ...writeResponses, 200: policySchema },
      },
    },
    unfreezeSpendingPolicyHandler,
  );

  done();
};
