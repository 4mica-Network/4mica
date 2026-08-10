import type { AxiosInstance, AxiosRequestConfig } from "axios";
import axios, { isAxiosError } from "axios";
import { EmailClientError, type EmailValidationIssue } from "./errors";
import type {
  AccountDeletedPayload,
  ActionRequiredPayload,
  AgentCreatedPayload,
  AnnouncementPayload,
  CreditLimitChangedPayload,
  DisputeCreatedPayload,
  PaymentSucceededPayload,
  PayoutPaidPayload,
  ReceiptPayload,
  SubscriptionExpirationPayload,
  SubscriptionRenewedPayload,
  WaitlistConfirmationPayload,
  WaitlistInvitationPayload,
  WeeklyReportPayload,
  WelcomePayload,
  WorkspaceInvitePayload,
} from "./payloads";
import {
  type TemplateId,
  type TemplatePayload,
  templatePath,
} from "./templates";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 200;

export interface EmailClientLogger {
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export interface EmailClientOptions {
  /**
   * Throw {@link EmailClientError} when a send fails (the default). Set to
   * false for fire-and-forget paths — a signup should not fail because the
   * mailer is down — and failed sends resolve to `null` instead.
   */
  throwOnError?: boolean;
  timeoutMs?: number;
  /** Retries for transport errors, 429 and 5xx. 4xx always fails fast. */
  retries?: number;
  headers?: Record<string, string>;
  logger?: EmailClientLogger;
  /** Escape hatch for anything axios supports that is not modelled above. */
  axiosConfig?: AxiosRequestConfig;
}

export interface SendEmailResult {
  id: string;
  templateId: TemplateId;
}

interface SendEmailResponse {
  id?: string;
}

interface ErrorEnvelope {
  error?: string;
  message?: string;
  issues?: EmailValidationIssue[];
}

const isRetryable = (status: number): boolean =>
  status === 0 || status === 429 || status >= 500;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export class EmailClient {
  private readonly http: AxiosInstance;
  private readonly throwOnError: boolean;
  private readonly retries: number;
  private readonly logger: EmailClientLogger | undefined;

  constructor(baseURL: string, options: EmailClientOptions = {}) {
    const {
      throwOnError = true,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      retries = DEFAULT_RETRIES,
      headers,
      logger,
      axiosConfig,
    } = options;

    this.throwOnError = throwOnError;
    this.retries = Math.max(0, retries);
    this.logger = logger;
    this.http = axios.create({
      baseURL,
      timeout: timeoutMs,
      headers: { "Content-Type": "application/json", ...headers },
      ...axiosConfig,
    });
  }

  /**
   * Send any template. The payload type is resolved from the template id, so
   * `send("welcome", …)` will not accept a receipt payload.
   */
  async send<K extends TemplateId>(
    id: K,
    payload: TemplatePayload<K>,
  ): Promise<SendEmailResult | null> {
    let lastError: EmailClientError | undefined;

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await this.http.post<SendEmailResponse>(
          templatePath(id),
          payload,
        );

        return { id: response.data?.id ?? "", templateId: id };
      } catch (error: unknown) {
        lastError = this.toClientError(id, error);

        if (!isRetryable(lastError.status) || attempt === this.retries) {
          break;
        }

        this.logger?.warn(`[EmailClient] retrying ${id}`, {
          attempt: attempt + 1,
          status: lastError.status,
        });

        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      }
    }

    const failure =
      lastError ??
      new EmailClientError(id, 0, "unknown_error", "The send failed.");

    if (this.throwOnError) {
      throw failure;
    }

    this.logger?.error(`[EmailClient] failed to send ${id}`, {
      status: failure.status,
      code: failure.code,
      message: failure.message,
    });

    return null;
  }

  private toClientError(id: TemplateId, error: unknown): EmailClientError {
    if (isAxiosError<ErrorEnvelope>(error)) {
      const status = error.response?.status ?? 0;
      const body = error.response?.data;

      return new EmailClientError(
        id,
        status,
        body?.error ?? (status === 0 ? "transport_error" : "request_failed"),
        body?.message ?? error.message,
        body?.issues ?? [],
        { cause: error },
      );
    }

    return new EmailClientError(
      id,
      0,
      "unknown_error",
      error instanceof Error ? error.message : String(error),
      [],
      { cause: error },
    );
  }

  sendWelcome(payload: WelcomePayload) {
    return this.send("welcome", payload);
  }

  sendActionRequired(payload: ActionRequiredPayload) {
    return this.send("action-required", payload);
  }

  sendWaitlistConfirmation(payload: WaitlistConfirmationPayload) {
    return this.send("waitlist-confirmation", payload);
  }

  sendWaitlistInvitation(payload: WaitlistInvitationPayload) {
    return this.send("waitlist-invitation", payload);
  }

  sendWorkspaceInvite(payload: WorkspaceInvitePayload) {
    return this.send("workspace-invite", payload);
  }

  sendReceipt(payload: ReceiptPayload) {
    return this.send("receipt", payload);
  }

  sendSubscriptionExpiration(payload: SubscriptionExpirationPayload) {
    return this.send("subscription-expiration", payload);
  }

  sendSubscriptionRenewed(payload: SubscriptionRenewedPayload) {
    return this.send("subscription-renewed", payload);
  }

  sendPaymentSucceeded(payload: PaymentSucceededPayload) {
    return this.send("payment-succeeded", payload);
  }

  sendPayoutPaid(payload: PayoutPaidPayload) {
    return this.send("payout-paid", payload);
  }

  sendDisputeCreated(payload: DisputeCreatedPayload) {
    return this.send("dispute-created", payload);
  }

  sendCreditLimitChanged(payload: CreditLimitChangedPayload) {
    return this.send("credit-limit-changed", payload);
  }

  sendAgentCreated(payload: AgentCreatedPayload) {
    return this.send("agent-created", payload);
  }

  sendAccountDeleted(payload: AccountDeletedPayload) {
    return this.send("account-deleted", payload);
  }

  sendWeeklyReport(payload: WeeklyReportPayload) {
    return this.send("weekly-report", payload);
  }

  sendAnnouncement(payload: AnnouncementPayload) {
    return this.send("announcement", payload);
  }
}
