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

/** Raised when Resend rejects the send or the SDK throws. */
export class EmailSendError extends Error {
  readonly templateId: TemplateId;

  constructor(templateId: TemplateId, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "EmailSendError";
    this.templateId = templateId;
  }
}

/**
 * Created lazily so importing this module never requires a key — the dry-run
 * path and the unit tests both run without one.
 */
let client: Resend | undefined;

const resend = (): Resend => {
  client ??= new Resend(config.email.apiKey);

  return client;
};

/** Test seam: forces the next call to build a fresh client. */
export const resetResendClient = (): void => {
  client = undefined;
};

/** Turns ada@4mica.io into a***@4mica.io so logs never carry a full address. */
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

  // A text/plain alternative materially improves deliverability, and some
  // clients (and every screen reader fallback) prefer it.
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
