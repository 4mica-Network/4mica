import { type TemplateId, templateSchemas } from "@4mica/email-client";
import { invalidBody, parseBody } from "@controllers/shared";
import { appLogger } from "@logger/index";
import { EmailSendError, sendTemplate } from "@services/resend";
import type { RouteHandler } from "fastify";

/**
 * One handler factory for all 16 routes. The template id closes over the
 * schema and the registry entry, so a new template needs no handler of its
 * own.
 */
export const makeSendHandler = (id: TemplateId): RouteHandler => {
  const schema = templateSchemas[id];

  return async (request, reply) => {
    const parsed = parseBody(schema, request.body);

    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
    }

    try {
      // parseBody narrows to the union of every template's output; the id and
      // the schema it came from are the same key, so this pairing is sound.
      const result = await sendTemplate(id, parsed.data as never);

      return reply.code(202).send(result);
    } catch (error: unknown) {
      const message =
        error instanceof EmailSendError
          ? error.message
          : "The email provider rejected the message.";

      appLogger.error("Failed to send email", { templateId: id, error });

      return reply.code(502).send({ error: "email_send_failed", message });
    }
  };
};
