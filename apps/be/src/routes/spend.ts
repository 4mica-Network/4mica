import { authenticateApiKey } from "@auth/api-key";
import {
  authorizeSpendHandler,
  consumeAuthorizationHandler,
  getAuthorizationHandler,
  listAuthorizationsHandler,
  releaseAuthorizationHandler,
} from "@controllers/spend/index";
import { apiKeyRateLimit } from "@plugins/rate-limit";
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
const nullDate = { ...date, nullable: true } as const;

const networks = ["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"];
const statuses = [
  "RESERVED",
  "PENDING_APPROVAL",
  "DENIED",
  "CONSUMED",
  "RELEASED",
  "EXPIRED",
];

const authorizationProperties = {
  id: str,
  status: { type: "string", enum: statuses },
  deniedReason: nullStr,
  policyId: nullStr,
  approvalRequestId: nullStr,
  expiresAt: date,
  amount: str,
  authorizedAmount: nullStr,
  settledAmount: nullStr,
  network: { type: "string", enum: networks },
  assetAddress: nullStr,
} as const;

const authorizationSchema = {
  type: "object",
  required: Object.keys(authorizationProperties),
  properties: authorizationProperties,
} as const;

const authorizationDetailSchema = {
  type: "object",
  required: Object.keys(authorizationProperties),
  properties: {
    ...authorizationProperties,
    projectId: str,
    environment: { type: "string", enum: ["SANDBOX", "PRODUCTION"] },
    apiKeyId: nullStr,
    agentId: nullStr,
    payerAddress: str,
    recipientAddress: str,
    reqId: nullStr,
    paymentId: nullStr,
    consumedAt: nullDate,
    createdAt: date,
  },
} as const;

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
} as const;

const keyResponses = {
  ...limitedResponses,
  200: authorizationSchema,
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
} as const;

export const spendRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const keyed = {
    onRequest: [authenticateApiKey],
    preHandler: [apiKeyRateLimit(app)],
  };

  app.post(
    "/v1/spend/authorize",
    {
      ...keyed,
      schema: {
        tags: ["spend"],
        summary: "Ask before paying: check a payment against spending policies",
        description:
          "Cooperative, buyer-side control: 4mica is not in the payment path, so this only works when the paying SDK asks before it signs. Returns RESERVED (pay within `expiresAt`, then consume), PENDING_APPROVAL (poll until a person approves) or DENIED with `deniedReason`. Payments reported without an authorization still count toward limits and raise an alert. A `reqId` identifies one payment per organization, network and asset: while another RESERVED, PENDING_APPROVAL or CONSUMED authorization of that identity holds it, the answer is 409 `req_id_in_use`. Needs the SPEND_AUTHORIZE scope.",
        security: [{ apiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["network", "amount", "payerAddress", "recipientAddress"],
          properties: {
            network: { type: "string", enum: networks },
            assetAddress: nullStr,
            amount: str,
            payerAddress: str,
            recipientAddress: str,
            reqId: nullStr,
            agentId: nullStr,
          },
        },
        response: keyResponses,
      },
    },
    authorizeSpendHandler,
  );

  app.get(
    "/v1/spend/authorizations/:id",
    {
      ...keyed,
      schema: {
        tags: ["spend"],
        summary: "Fetch a spend authorization",
        description:
          "A PENDING_APPROVAL authorization becomes RESERVED with a fresh 10-minute expiry once approved, or DENIED if the approval is rejected or expires.",
        security: [{ apiKeyAuth: [] }],
        params: idParamSchema,
        response: keyResponses,
      },
    },
    getAuthorizationHandler,
  );

  app.post(
    "/v1/spend/authorizations/:id/consume",
    {
      ...keyed,
      schema: {
        tags: ["spend"],
        summary: "Mark a reserved authorization as spent",
        description:
          "Pass the payment's `reqId` so the reported payment reconciles to this authorization. A `reqId` that another live or consumed authorization of the same organization, network and asset already holds is refused with 409 `req_id_in_use`.",
        security: [{ apiKeyAuth: [] }],
        params: idParamSchema,
        body: {
          type: "object",
          properties: { reqId: nullStr, txHash: nullStr },
        },
        response: keyResponses,
      },
    },
    consumeAuthorizationHandler,
  );

  app.post(
    "/v1/spend/authorizations/:id/release",
    {
      ...keyed,
      schema: {
        tags: ["spend"],
        summary: "Give back a reservation that will not be spent",
        description: "A pending approval is cancelled.",
        security: [{ apiKeyAuth: [] }],
        params: idParamSchema,
        response: keyResponses,
      },
    },
    releaseAuthorizationHandler,
  );

  app.get(
    "/me/spend/authorizations",
    {
      ...guards(app),
      schema: {
        tags: ["spend"],
        summary: "List spend authorizations in the active environment",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: statuses },
            projectId: { type: "string", maxLength: 64 },
            agentId: { type: "string", maxLength: 64 },
            apiKeyId: { type: "string", maxLength: 64 },
            from: { type: "string", maxLength: 40 },
            to: { type: "string", maxLength: 40 },
            cursor: { type: "string", maxLength: 64 },
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
        response: {
          ...limitedResponses,
          200: {
            type: "object",
            required: ["items", "nextCursor"],
            properties: {
              items: { type: "array", items: authorizationDetailSchema },
              nextCursor: nullStr,
            },
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    listAuthorizationsHandler,
  );

  done();
};
