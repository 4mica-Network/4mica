import type { AppIssue } from "@/app/models";
import { FourMicaError } from "@/errors";

export class AppError extends FourMicaError {
  readonly status?: number;
  readonly code?: string;
  readonly issues: AppIssue[];
  readonly body?: unknown;

  constructor(
    message: string,
    options?: {
      status?: number;
      code?: string;
      issues?: AppIssue[];
      body?: unknown;
    },
  ) {
    super(message);
    this.status = options?.status;
    this.code = options?.code;
    this.issues = options?.issues ?? [];
    this.body = options?.body;
  }
}
