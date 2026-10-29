import { getConfigHandler } from "@controllers/config/index";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  configResponseSchema,
  errorResponseSchema,
  limitedResponses,
} from "./schema-fragments";

export const configRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    "/config",
    {
      ...guards(app),
      schema: {
        tags: ["config"],
        summary:
          "Option lists the dashboard renders: countries, time zones, currencies and domain enums.",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: configResponseSchema,
          304: { type: "null" },
          401: errorResponseSchema,
        },
      },
    },
    getConfigHandler,
  );

  done();
};
