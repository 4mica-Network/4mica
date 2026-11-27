import type { EmailClient } from "@4mica/email-client";
import { config } from "@config/index";
import { appLogger } from "@logger/index";
import { type AlertRow, financeRecipients } from "./repository";

const linesOf = (detail: AlertRow["detail"]): string[] => {
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const lines = (detail as Record<string, unknown>).lines;
    if (Array.isArray(lines)) {
      return lines.filter((line): line is string => typeof line === "string");
    }
  }
  return [];
};

export const notifyFinance = async (
  email: EmailClient | null,
  orgId: string,
  alerts: AlertRow[],
): Promise<void> => {
  if (!email || alerts.length === 0) {
    return;
  }
  try {
    const { workspaceName, recipients } = await financeRecipients(orgId);
    const dashboardUrl = `${config.appUrl.replace(/\/$/, "")}/finance/alerts`;
    await Promise.all(
      alerts.flatMap((alert) =>
        recipients.map((recipient) =>
          email.sendFinancialAlert({
            to: recipient.email,
            userName: recipient.name || undefined,
            workspaceName,
            title: alert.title,
            lines: linesOf(alert.detail),
            dashboardUrl,
            idempotencyKey: `financial-alert:${alert.id}:${recipient.email}`,
          }),
        ),
      ),
    );
  } catch (error) {
    appLogger.error("Could not email finance recipients", {
      orgId,
      alerts: alerts.map((alert) => alert.id),
      error,
    });
  }
};
