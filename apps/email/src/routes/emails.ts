import {
  templateIds,
  templatePath,
  templateSchemas,
} from "@4mica/email-client";
import { makeSendHandler } from "@controllers/emails/index";
import { registry } from "@templates/registry";
import { toJsonSchema } from "@valibot/to-json-schema";
import type { FastifyPluginCallback } from "fastify";
import {
  errorResponseSchema,
  limitedResponses,
  sendAcceptedSchema,
} from "./schema-fragments";

export const emailRoutes: FastifyPluginCallback = (app, _opts, done) => {
  for (const id of templateIds) {
    app.post(
      templatePath(id),
      {
        schema: {
          tags: ["emails"],
          summary: registry[id].summary,
          body: toJsonSchema(templateSchemas[id], { errorMode: "ignore" }),
          response: {
            202: sendAcceptedSchema,
            400: errorResponseSchema,
            502: errorResponseSchema,
            ...limitedResponses,
          },
        },
      },
      makeSendHandler(id),
    );
  }

  done();
};
