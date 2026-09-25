import {
  batchDeleteApiListingsHandler,
  createApiListingHandler,
  deleteApiListingHandler,
  getApiListingHandler,
  listApiListingsHandler,
  publishApiListingHandler,
  replaceApiEndpointsHandler,
  unpublishApiListingHandler,
  updateApiListingHandler,
} from "@controllers/api-listings/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  apiListingListResponseSchema,
  apiListingResponseSchema,
  batchDeleteResponseSchema,
  errorResponseSchema,
  limitedResponses,
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
    visibility: { type: "string", enum: ["PRIVATE", "UNLISTED", "PUBLIC"] },
    network: {
      type: "string",
      enum: ["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"],
    },
    sort: {
      type: "string",
      enum: [
        "createdAt",
        "-createdAt",
        "updatedAt",
        "-updatedAt",
        "name",
        "-name",
      ],
    },
  },
} as const;

export const apiListingRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  app.get(
    "/me/api-listings",
    {
      ...base,
      schema: {
        tags: ["api-listings"],
        summary: "List the account's API listings",
        security: [{ bearerAuth: [] }],
        querystring: listQuerySchema,
        response: {
          ...limitedResponses,
          200: apiListingListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    listApiListingsHandler,
  );

  app.get(
    "/me/api-listings/:id",
    {
      ...base,
      schema: {
        tags: ["api-listings"],
        summary: "Fetch one API listing",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: apiListingResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    getApiListingHandler,
  );

  app.post(
    "/me/api-listings",
    {
      ...strict,
      schema: {
        tags: ["api-listings"],
        summary: "Create an API listing",
        description:
          "`network` and `payToAddress` are derived from `walletId` and are not accepted from the body — a listing may only advertise an address this account has proved it controls.",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          201: apiListingResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    createApiListingHandler,
  );

  app.patch(
    "/me/api-listings/:id",
    {
      ...strict,
      schema: {
        tags: ["api-listings"],
        summary: "Update an API listing",
        description:
          "Endpoints are not editable here — use PUT /me/api-listings/:id/endpoints, so the route set has exactly one writer. Setting `walletId` to null clears `network` and `payToAddress` together.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: apiListingResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    updateApiListingHandler,
  );

  app.put(
    "/me/api-listings/:id/endpoints",
    {
      ...strict,
      schema: {
        tags: ["api-listings"],
        summary: "Replace the listing's endpoints wholesale",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: apiListingResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    replaceApiEndpointsHandler,
  );

  app.post(
    "/me/api-listings/:id/publish",
    {
      ...strict,
      schema: {
        tags: ["api-listings"],
        summary: "Publish a listing to the public profile",
        description:
          "Refuses with listing_not_payable when no receiving wallet is set, because the published integration guide would have no address to generate code against.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: apiListingResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    publishApiListingHandler,
  );

  app.post(
    "/me/api-listings/:id/unpublish",
    {
      ...strict,
      schema: {
        tags: ["api-listings"],
        summary: "Hide a listing from the public profile",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: apiListingResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    unpublishApiListingHandler,
  );

  app.delete(
    "/me/api-listings/:id",
    {
      ...strict,
      schema: {
        tags: ["api-listings"],
        summary: "Remove an API listing",
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
    deleteApiListingHandler,
  );

  app.post(
    "/me/api-listings/batch-delete",
    {
      ...strict,
      schema: {
        tags: ["api-listings"],
        summary: "Remove up to 100 listings at once",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: batchDeleteResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    batchDeleteApiListingsHandler,
  );

  done();
};
