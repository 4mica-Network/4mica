import {
  batchDeleteWalletsHandler,
  createWalletHandler,
  createWalletNonceHandler,
  deleteWalletHandler,
  getWalletHandler,
  listWalletsHandler,
  updateWalletHandler,
} from "@controllers/wallets/index";
import { revalidateOnWrite } from "@plugins/playground-revalidate";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { cliGuards, guards } from "./guards";
import {
  approvalRequiredResponseSchema,
  batchDeleteResponseSchema,
  errorResponseSchema,
  idParam,
  limitedResponses,
  walletListResponseSchema,
  walletNonceResponseSchema,
  walletResponseSchema,
} from "./schema-fragments";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
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

  const publicWrite = { ...strict, onResponse: revalidateOnWrite };

  const read = cliGuards(app, "wallets:read");
  const strictFor = (scope: "wallets:link" | "wallets:unlink") => {
    const guard = cliGuards(app, scope);
    return {
      onRequest: guard.onRequest,
      preHandler: [...guard.preHandler, sensitiveRateLimit(app)],
    };
  };
  const link = strictFor("wallets:link");
  const unlink = strictFor("wallets:unlink");
  const sessionSecurity: Record<string, string[]>[] = [
    { bearerAuth: [] },
    { cliTokenAuth: [] },
  ];

  app.get(
    "/me/wallets",
    {
      ...read,
      schema: {
        tags: ["wallets"],
        summary: "List the account's wallets",
        security: sessionSecurity,
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
      ...link,
      schema: {
        tags: ["wallets"],
        summary: "Start linking a wallet: get a message to sign",
        description:
          "Issues a single-use EIP-4361 challenge for any valid address. It deliberately does not reveal whether the address is already linked — that would make this an address-enumeration oracle.",
        security: sessionSecurity,
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
      ...link,
      schema: {
        tags: ["wallets"],
        summary: "Link a wallet by proving control of its address",
        description:
          "Verifies the signature over the challenge issued by /me/wallets/siwe-nonce. Externally owned accounts only; contract wallets are rejected with invalid_signature.",
        security: sessionSecurity,
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
      ...publicWrite,
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
      ...unlink,
      onResponse: revalidateOnWrite,
      schema: {
        tags: ["wallets"],
        summary: "Remove a wallet",
        security: sessionSecurity,
        params: idParamSchema,
        response: {
          ...limitedResponses,
          202: approvalRequiredResponseSchema,
          204: { type: "null" },
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    deleteWalletHandler,
  );

  app.post(
    "/me/wallets/batch-delete",
    {
      ...publicWrite,
      schema: {
        tags: ["wallets"],
        summary: "Remove up to 100 wallets at once",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: batchDeleteResponseSchema,
          202: approvalRequiredResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    batchDeleteWalletsHandler,
  );

  done();
};
