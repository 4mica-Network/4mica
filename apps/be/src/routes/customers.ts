import { authenticateApiKey } from "@auth/api-key";
import {
  addCustomerIdentityHandler,
  batchDeleteCustomersHandler,
  createCustomerCouponHandler,
  createCustomerHandler,
  customerActivityHandler,
  customerBreakdownHandler,
  customerOverviewHandler,
  deleteCustomerCouponHandler,
  deleteCustomerHandler,
  getCustomerHandler,
  grantCustomerCreditHandler,
  listCustomerCouponsHandler,
  listCustomerCreditHandler,
  listCustomersHandler,
  removeCustomerIdentityHandler,
  resetCustomerUsageHandler,
  resolveCustomerHandler,
  setCustomerPolicyHandler,
  setCustomerStatusHandler,
  updateCustomerCouponHandler,
  updateCustomerHandler,
  updateCustomerIdentityHandler,
  zeroCustomerCreditHandler,
} from "@controllers/customers/index";
import { apiKeyRateLimit, sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  batchDeleteResponseSchema,
  customerBreakdownResponseSchema,
  customerCouponListResponseSchema,
  customerCouponResponseSchema,
  customerCreditGrantedResponseSchema,
  customerCreditResponseSchema,
  customerListResponseSchema,
  customerOverviewResponseSchema,
  customerResolveResponseSchema,
  customerResponseSchema,
  errorResponseSchema,
  limitedResponses,
  paymentListResponseSchema,
} from "./schema-fragments";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
} as const;

const couponParamSchema = {
  type: "object",
  required: ["id", "couponId"],
  properties: { id: { type: "string" }, couponId: { type: "string" } },
} as const;

const identityParamSchema = {
  type: "object",
  required: ["id", "identityId"],
  properties: { id: { type: "string" }, identityId: { type: "string" } },
} as const;

const networkEnum = {
  type: "string",
  enum: ["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"],
} as const;

const listQuerySchema = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    q: { type: "string", maxLength: 100 },
    type: {
      type: "string",
      enum: ["HUMAN", "ORGANIZATION", "AGENT", "WALLET"],
    },
    status: { type: "string", enum: ["ACTIVE", "BLOCKED", "SUSPENDED"] },
    network: networkEnum,
    source: {
      type: "string",
      enum: ["MANUAL", "API", "VERIFIED", "DISCOVERED"],
    },
    sort: {
      type: "string",
      enum: [
        "totalSpend",
        "-totalSpend",
        "recentSpend",
        "-recentSpend",
        "txnCount",
        "-txnCount",
        "lastActiveAt",
        "-lastActiveAt",
        "name",
        "-name",
        "createdAt",
        "-createdAt",
      ],
    },
  },
} as const;

const activityQuerySchema = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    status: { type: "string", enum: ["PENDING", "SETTLED", "FAILED"] },
    network: networkEnum,
    sort: {
      type: "string",
      enum: ["createdAt", "-createdAt", "amount", "-amount"],
    },
  },
} as const;

export const customerRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  app.get(
    "/me/customers",
    {
      ...base,
      schema: {
        tags: ["customers"],
        summary: "List the account's customers",
        description:
          "Spend, transaction count and last activity are derived by matching each customer's wallet identities against payments received by this account's own wallets — a payer who also pays someone else contributes nothing here.",
        security: [{ bearerAuth: [] }],
        querystring: listQuerySchema,
        response: {
          ...limitedResponses,
          200: customerListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    listCustomersHandler,
  );

  app.post(
    "/me/customers/batch-delete",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Remove up to 100 customers at once",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: batchDeleteResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    batchDeleteCustomersHandler,
  );

  app.get(
    "/me/customers/:id",
    {
      ...base,
      schema: {
        tags: ["customers"],
        summary: "Fetch one customer",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    getCustomerHandler,
  );

  app.post(
    "/me/customers",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Create a customer",
        description:
          "Payment identities may be attached in the same call. Spend limits are advisory — 4Mica is not in the payment path for reported payments, so nothing enforces them.",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          201: customerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    createCustomerHandler,
  );

  app.patch(
    "/me/customers/:id",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Update a customer",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    updateCustomerHandler,
  );

  app.patch(
    "/me/customers/:id/status",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Block, suspend or reactivate a customer",
        description:
          "A suspension needs an end date and lapses on its own once that passes. Reactivating clears both the end date and the reason.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    setCustomerStatusHandler,
  );

  app.patch(
    "/me/customers/:id/policy",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Set what this customer is charged",
        description:
          "A free allowance is a unit, an amount and a period together, or nothing. Writing one starts its window now, so the allowance is never already spent by earlier payments.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    setCustomerPolicyHandler,
  );

  app.post(
    "/me/customers/:id/reset-usage",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Start the free allowance window again",
        description:
          "Moves the line usage is counted from to now, so the customer gets a full allowance without their payment history being touched.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    resetCustomerUsageHandler,
  );

  app.delete(
    "/me/customers/:id",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Remove a customer",
        description:
          "Soft deletes the customer and drops its payment identities, which frees those addresses to be mapped to another customer.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          204: { type: "null" },
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    deleteCustomerHandler,
  );

  app.post(
    "/me/customers/:id/identities",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Attach a payment identity to a customer",
        description:
          "A WALLET identity matches on network and address together. Attaching one surfaces that address's existing history, bounded by `validFrom`/`validUntil` when they are set.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          201: customerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    addCustomerIdentityHandler,
  );

  app.patch(
    "/me/customers/:id/identities/:identityId",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Block an identity, or change its window or source",
        security: [{ bearerAuth: [] }],
        params: identityParamSchema,
        response: {
          ...limitedResponses,
          200: customerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    updateCustomerIdentityHandler,
  );

  app.delete(
    "/me/customers/:id/identities/:identityId",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Detach a payment identity",
        security: [{ bearerAuth: [] }],
        params: identityParamSchema,
        response: {
          ...limitedResponses,
          204: { type: "null" },
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    removeCustomerIdentityHandler,
  );

  app.get(
    "/me/customers/:id/credit",
    {
      ...base,
      schema: {
        tags: ["customers"],
        summary: "This customer's credit balance and its movements",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerCreditResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    listCustomerCreditHandler,
  );

  app.post(
    "/me/customers/:id/credit",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Grant or take back credit",
        description:
          "The amount is signed, so a correction is the same shape as a grant. The balance is the sum of these movements and nothing is ever overwritten.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          201: customerCreditGrantedResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    grantCustomerCreditHandler,
  );

  app.delete(
    "/me/customers/:id/credit",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Take the balance back to zero",
        description:
          "Writes the offsetting movement rather than deleting rows, so what was granted stays on the record.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerCreditResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    zeroCustomerCreditHandler,
  );

  app.get(
    "/me/customers/:id/coupons",
    {
      ...base,
      schema: {
        tags: ["customers"],
        summary: "Coupons that belong to this customer",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerCouponListResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    listCustomerCouponsHandler,
  );

  app.post(
    "/me/customers/:id/coupons",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Give this customer a coupon",
        description:
          "The code is unique per account. An expiry must be in the future and a usage limit must be at least one; leaving either out means no expiry and no limit.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          201: customerCouponResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    createCustomerCouponHandler,
  );

  app.patch(
    "/me/customers/:id/coupons/:couponId",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Change a coupon's expiry, limit, or revoke it",
        description:
          "The code, kind and value are fixed once issued — reissue instead, so a coupon already handed out cannot change what it is worth.",
        security: [{ bearerAuth: [] }],
        params: couponParamSchema,
        response: {
          ...limitedResponses,
          200: customerCouponResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    updateCustomerCouponHandler,
  );

  app.delete(
    "/me/customers/:id/coupons/:couponId",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Remove a coupon",
        security: [{ bearerAuth: [] }],
        params: couponParamSchema,
        response: {
          ...limitedResponses,
          204: { type: "null" },
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    deleteCustomerCouponHandler,
  );

  app.get(
    "/me/customers/:id/overview",
    {
      ...base,
      schema: {
        tags: ["customers"],
        summary: "Spend and activity totals for one customer",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerOverviewResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    customerOverviewHandler,
  );

  app.get(
    "/me/customers/:id/activity",
    {
      ...base,
      schema: {
        tags: ["customers"],
        summary: "Payments this customer made to the account",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        querystring: activityQuerySchema,
        response: {
          ...limitedResponses,
          200: paymentListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    customerActivityHandler,
  );

  app.get(
    "/me/customers/:id/breakdown",
    {
      ...base,
      schema: {
        tags: ["customers"],
        summary: "What this customer paid for, by agent and API",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerBreakdownResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    customerBreakdownHandler,
  );

  app.post(
    "/v1/customers/resolve",
    {
      onRequest: [authenticateApiKey],
      preHandler: [apiKeyRateLimit(app)],
      schema: {
        tags: ["customers"],
        summary: "What this payer owes, and whether they may pay at all",
        description:
          "Applies the customer's access rules and pricing to a gross amount: allowance first, then the coupon, then the standing discounts, then credit. Read only — it spends no allowance, redeems no coupon and draws down no credit, so it is safe to call before every paid request. An unrecognised payer is allowed at full price rather than refused.",
        security: [{ apiKeyAuth: [] }],
        response: {
          ...limitedResponses,
          200: customerResolveResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    resolveCustomerHandler,
  );

  done();
};
