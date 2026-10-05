import {
  batchDeleteWalletsHandler,
  createWalletHandler,
  createWalletNonceHandler,
  deleteWalletHandler,
  getWalletHandler,
  listWalletsHandler,
  updateWalletHandler,
} from "@controllers/wallets/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  batchDeleteResponseSchema,
  errorResponseSchema,
  limitedResponses,
  walletListResponseSchema,
  walletNonceResponseSchema,
  walletResponseSchema,
} from "./schema-fragments";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
} as const;

const listQuerySchema = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    q: { type: "string", maxLength: 100 },
    status: { type: "string", enum: ["ACTIVE", "PAUSED", "RETIRED"] },
    network: {
      type: "string",
      enum: ["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"],
    },
    role: { type: "string", enum: ["PAYER", "RECIPIENT", "BOTH"] },
    sort: {
      type: "string",
      enum: ["createdAt", "-createdAt", "label", "-label"],
    },
  },
} as const;

export const walletRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  app.get(
    "/me/wallets",
    {
      ...base,
      schema: {
        tags: ["wallets"],
        summary: "List the account's wallets",
        security: [{ bearerAuth: [] }],
        querystring: listQuerySchema,
        response: {
          ...limitedResponses,
          200: walletListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    listWalletsHandler,
  );

  app.get(
    "/me/wallets/:id",
    {
      ...base,
      schema: {
        tags: ["wallets"],
        summary: "Fetch one wallet",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: walletResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    getWalletHandler,
  );

  app.post(
    "/me/wallets/siwe-nonce",
    {
      ...strict,
      schema: {
        tags: ["wallets"],
        summary: "Start linking a wallet: get a message to sign",
        description:
          "Issues a single-use EIP-4361 challenge for any valid address. It deliberately does not reveal whether the address is already linked — that would make this an address-enumeration oracle.",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          201: walletNonceResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    createWalletNonceHandler,
  );

  app.post(
    "/me/wallets",
    {
      ...strict,
      schema: {
        tags: ["wallets"],
        summary: "Link a wallet by proving control of its address",
        description:
          "Verifies the signature over the challenge issued by /me/wallets/siwe-nonce. Externally owned accounts only; contract wallets are rejected with invalid_signature.",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          201: walletResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    createWalletHandler,
  );

  app.patch(
    "/me/wallets/:id",
    {
      ...strict,
      schema: {
        tags: ["wallets"],
        summary: "Update a wallet's label, description, role or status",
        description:
          "Address and network are immutable: re-pointing a wallet would carry its proof of control across to an unproven address.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: walletResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    updateWalletHandler,
  );

  app.delete(
    "/me/wallets/:id",
    {
      ...strict,
      schema: {
        tags: ["wallets"],
        summary: "Remove a wallet",
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
    deleteWalletHandler,
  );

  app.post(
    "/me/wallets/batch-delete",
    {
      ...strict,
      schema: {
        tags: ["wallets"],
        summary: "Remove up to 100 wallets at once",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: batchDeleteResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    batchDeleteWalletsHandler,
  );

  done();
};
