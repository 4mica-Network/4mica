import type { TemplateId, TemplateProps } from "@4mica/email-client";
import { config } from "@config/index";
import { emailLogger } from "@logger/index";
import { getTemplate } from "@templates/registry";
import { render } from "react-email";
import { Resend } from "resend";

export interface SendResult {
  id: string;
  templateId: TemplateId;
  dryRun: boolean;
}

export class EmailSendError extends Error {
  readonly templateId: TemplateId;

  constructor(templateId: TemplateId, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "EmailSendError";
    this.templateId = templateId;
  }
}

let client: Resend | undefined;

const resend = (): Resend => {
  client ??= new Resend(config.email.apiKey);

  return client;
};

export const resetResendClient = (): void => {
  client = undefined;
};

const redact = (address: string): string => {
  const [local, domain] = address.split("@");

  if (!local || !domain) {
    return "***";
  }

  return `${local.slice(0, 1)}***@${domain}`;
};

export const sendTemplate = async <K extends TemplateId>(
  id: K,
  props: TemplateProps<K>,
): Promise<SendResult> => {
  const template = getTemplate(id);
  const element = template.component(props);
  const subject = template.subject(props);

  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);

  const message = {
    from: config.email.from,
    to: [props.to],
    replyTo: template.replyTo ?? config.email.replyTo,
    subject,
    html,
    text,
  };

  if (config.email.dryRun) {
    emailLogger.info("[dry-run] email not sent", {
      templateId: id,
      to: redact(props.to),
      subject,
      bytes: html.length,
    });

    return { id: `dry-run_${id}_${Date.now()}`, templateId: id, dryRun: true };
  }

  let result: Awaited<ReturnType<Resend["emails"]["send"]>>;

  try {
    result = await resend().emails.send(
      message,
      props.idempotencyKey ? { idempotencyKey: props.idempotencyKey } : {},
    );
  } catch (error: unknown) {
    throw new EmailSendError(
      id,
      error instanceof Error ? error.message : String(error),
      error,
    );
  }

  if (result.error) {
    throw new EmailSendError(id, result.error.message, result.error);
  }

  if (!result.data?.id) {
    throw new EmailSendError(
      id,
      "Resend accepted the message but returned no id",
    );
  }

  emailLogger.info("email sent", {
    templateId: id,
    to: redact(props.to),
    messageId: result.data.id,
  });

  return { id: result.data.id, templateId: id, dryRun: false };
};
