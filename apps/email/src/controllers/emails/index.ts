import { type TemplateId, templateSchemas } from "@4mica/email-client";
import { invalidBody, parseBody } from "@controllers/shared";
import { appLogger } from "@logger/index";
import { EmailSendError, sendTemplate } from "@services/resend";
import type { RouteHandler } from "fastify";

export const makeSendHandler = (id: TemplateId): RouteHandler => {
  const schema = templateSchemas[id];

  return async (request, reply) => {
    const parsed = parseBody(schema, request.body);

    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
    }

    try {
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
