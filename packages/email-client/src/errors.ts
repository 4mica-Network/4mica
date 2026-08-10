import type { TemplateId } from "./templates";

export interface EmailValidationIssue {
  path: string;
  message: string;
}

/**
 * Raised when the email service rejects a send or is unreachable.
 *
 * `status` is 0 for transport failures (DNS, connection refused, timeout) so
 * callers can distinguish "the service said no" from "the service never
 * answered" without inspecting the underlying axios error.
 */
export class EmailClientError extends Error {
  readonly templateId: TemplateId;
  readonly status: number;
  readonly code: string;
  readonly issues: EmailValidationIssue[];

  constructor(
    templateId: TemplateId,
    status: number,
    code: string,
    message: string,
    issues: EmailValidationIssue[] = [],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "EmailClientError";
    this.templateId = templateId;
    this.status = status;
    this.code = code;
    this.issues = issues;
  }

  /** True when the request never reached the service. */
  get isTransportError(): boolean {
    return this.status === 0;
  }
}
