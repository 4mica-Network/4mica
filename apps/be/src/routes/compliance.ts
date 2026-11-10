import {
  createBeneficialOwnerHandler,
  deleteBeneficialOwnerHandler,
  getComplianceHandler,
  listBeneficialOwnersHandler,
  submitComplianceHandler,
  updateBeneficialOwnerHandler,
  updateComplianceHandler,
} from "@controllers/compliance/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  beneficialOwnerResponseSchema,
  complianceResponseSchema,
  errorResponseSchema,
  idParam,
  limitedResponses,
} from "./schema-fragments";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
} as const;

export const complianceRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  app.get(
    "/me/compliance",
    {
      ...base,
      schema: {
        tags: ["compliance"],
        summary: "Compliance details, beneficial owners and what is missing",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: complianceResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    getComplianceHandler,
  );

  app.patch(
    "/me/compliance",
    {
      ...base,
      schema: {
        tags: ["compliance"],
        summary: "Update compliance details",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: complianceResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    updateComplianceHandler,
  );

  app.post(
    "/me/compliance/submit",
    {
      ...strict,
      schema: {
        tags: ["compliance"],
        summary: "Submit compliance details for KYB review",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: complianceResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    submitComplianceHandler,
  );

  app.get(
    "/me/compliance/owners",
    {
      ...base,
      schema: {
        tags: ["compliance"],
        summary: "List beneficial owners, directors and controllers",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: { type: "array", items: beneficialOwnerResponseSchema },
          401: errorResponseSchema,
        },
      },
    },
    listBeneficialOwnersHandler,
  );

  app.post(
    "/me/compliance/owners",
    {
      ...strict,
      schema: {
        tags: ["compliance"],
        summary: "Add a beneficial owner, director or controller",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          201: beneficialOwnerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    createBeneficialOwnerHandler,
  );

  app.patch(
    "/me/compliance/owners/:id",
    {
      ...base,
      schema: {
        tags: ["compliance"],
        summary: "Update a beneficial owner",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: beneficialOwnerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    updateBeneficialOwnerHandler,
  );

  app.delete(
    "/me/compliance/owners/:id",
    {
      ...strict,
      schema: {
        tags: ["compliance"],
        summary: "Remove a beneficial owner",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          204: { type: "null" },
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    deleteBeneficialOwnerHandler,
  );

  done();
};
