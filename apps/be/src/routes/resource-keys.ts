import { authenticateApiKey } from "@auth/api-key";
import {
  createResourceKeyHandler,
  deleteResourceKeyHandler,
  getResourceHandler,
  listResourceKeysHandler,
  revokeResourceKeyHandler,
} from "@controllers/resource-keys/index";
import type { ResourceKind } from "@controllers/trust/repository";
import { apiKeyRateLimit, sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  apiKeyResponseSchema,
  createdApiKeyResponseSchema,
  errorResponseSchema,
  idParam,
  limitedResponses,
  resourceContextResponseSchema,
  resourceKeyListResponseSchema,
} from "./schema-fragments";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
} as const;

const keyParamSchema = {
  type: "object",
  required: ["id", "keyId"],
  properties: { id: idParam, keyId: idParam },
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

export const resourceKeyRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  for (const { kind, prefix, tag, noun } of SURFACES) {
    app.get(
      `${prefix}/:id/keys`,
      {
        ...base,
        schema: {
          tags: [tag],
          summary: `Keys that let a service read one ${noun}`,
          security: [{ bearerAuth: [] }],
          params: idParamSchema,
          response: {
            ...limitedResponses,
            200: resourceKeyListResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      listResourceKeysHandler(kind),
    );

    app.post(
      `${prefix}/:id/keys`,
      {
        ...strict,
        schema: {
          tags: [tag],
          summary: `Create a key for one ${noun}. The plaintext is returned only here.`,
          security: [{ bearerAuth: [] }],
          params: idParamSchema,
          response: {
            ...limitedResponses,
            201: createdApiKeyResponseSchema,
            400: errorResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      createResourceKeyHandler(kind),
    );

    app.post(
      `${prefix}/:id/keys/:keyId/revoke`,
      {
        ...strict,
        schema: {
          tags: [tag],
          summary: "Revoke a key without deleting its audit trail",
          security: [{ bearerAuth: [] }],
          params: keyParamSchema,
          response: {
            ...limitedResponses,
            200: apiKeyResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      revokeResourceKeyHandler(kind),
    );

    app.delete(
      `${prefix}/:id/keys/:keyId`,
      {
        ...strict,
        schema: {
          tags: [tag],
          summary: "Delete a key",
          security: [{ bearerAuth: [] }],
          params: keyParamSchema,
          response: {
            ...limitedResponses,
            204: { type: "null" },
            401: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      deleteResourceKeyHandler(kind),
    );
  }

  app.get(
    "/v1/resource",
    {
      onRequest: [authenticateApiKey],
      preHandler: [apiKeyRateLimit(app)],
      schema: {
        tags: ["api-listings", "agents"],
        summary: "The API listing or agent this key belongs to",
        description:
          "Returns the resource the key was minted from, with its pricing and payment wiring, published policy and FAQs. Exactly one of `listing` or `agent` is set, named by `kind`. A key from Settings → Developer is not tied to a resource and gets a 403.",
        security: [{ apiKeyAuth: [] }],
        response: {
          ...limitedResponses,
          200: resourceContextResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    getResourceHandler,
  );

  done();
};
