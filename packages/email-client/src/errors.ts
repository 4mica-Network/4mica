import type { TemplateId } from "./templates";

export interface EmailValidationIssue {
  path: string;
  message: string;
}

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

  get isTransportError(): boolean {
    return this.status === 0;
  }
}
