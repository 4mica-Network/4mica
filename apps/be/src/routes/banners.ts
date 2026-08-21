import {
  listBannersHandler,
  recordBannerInteractionHandler,
} from "@controllers/banners/index";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  bannerResponseSchema,
  errorResponseSchema,
  limitedResponses,
} from "./schema-fragments";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
} as const;

const interactionBodySchema = {
  type: "object",
  required: ["type"],
  properties: {
    type: {
      type: "string",
      enum: ["VIEWED", "CLICKED", "DISMISSED", "VIDEO_PLAYED"],
    },
  },
} as const;

export const bannerRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  app.get(
    "/banners",
    {
      ...base,
      schema: {
        tags: ["banners"],
        summary:
          "List promo banners that are live now and not dismissed by the caller.",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: bannerResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    listBannersHandler,
  );

  app.post(
    "/banners/:id/interactions",
    {
      ...base,
      schema: {
        tags: ["banners"],
        summary:
          "Record that the caller viewed, clicked, dismissed or played a banner.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        body: interactionBodySchema,
        response: {
          ...limitedResponses,
          204: { type: "null" },
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    recordBannerInteractionHandler,
  );

  done();
};
