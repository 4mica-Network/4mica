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

/**
 * One POST route per template, generated from the shared schema map. The
 * OpenAPI body schema is derived from the same valibot schema the handler
 * validates against, so the docs cannot drift from the validation.
 */
export const emailRoutes: FastifyPluginCallback = (app, _opts, done) => {
  for (const id of templateIds) {
    app.post(
      templatePath(id),
      {
        schema: {
          tags: ["emails"],
          summary: registry[id].summary,
          // errorMode "ignore": a few actions (v.trim, v.isoTimestamp) have
          // no JSON Schema equivalent. Dropping them keeps the documented
          // shape accurate — valibot, not ajv, is what actually validates.
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
