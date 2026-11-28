import {
  exportPaymentsHandler,
  exportUsageHandler,
  financeReconciliationHandler,
  financeSummaryHandler,
  financeUsageHandler,
} from "@controllers/finance/index";
import { USAGE_GROUPS } from "@controllers/finance/schema";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import { errorResponseSchema, limitedResponses } from "./schema-fragments";

const str = { type: "string" } as const;
const nullStr = { type: ["string", "null"] } as const;
const int = { type: "integer" } as const;
const dateTime = { type: "string", format: "date-time" } as const;

const errors = {
  ...limitedResponses,
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
} as const;

const RANGE_NOTE =
  "`from` and `to` are ISO 8601 dates or timestamps in UTC. A date-only `to` includes that whole day. The default window is the last 30 days and a window can span at most 366 days. Only payments on the networks of the active `X-Environment` are counted: sent payments are those paid from one of the organization's wallets, received ones are those reported by the organization.";

const range = {
  from: { type: "string", maxLength: 40 },
  to: { type: "string", maxLength: 40 },
} as const;

const usageQuery = {
  type: "object",
  properties: {
    ...range,
    groupBy: { type: "string", enum: USAGE_GROUPS },
    direction: { type: "string", enum: ["sent", "received"] },
  },
} as const;

const assetTotal = {
  type: "object",
  required: ["network", "assetAddress", "amount", "count"],
  properties: {
    network: str,
    assetAddress: nullStr,
    amount: str,
    count: int,
  },
} as const;

const summarySchema = {
  type: "object",
  required: ["sent", "received", "authorizations"],
  properties: {
    sent: { type: "array", items: assetTotal },
    received: { type: "array", items: assetTotal },
    authorizations: {
      type: "object",
      properties: {
        reserved: int,
        pendingApproval: int,
        consumed: int,
        denied: int,
        released: int,
        expired: int,
      },
    },
  },
} as const;

const usageSchema = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["key", "label", "network", "assetAddress", "amount"],
        properties: {
          key: nullStr,
          label: str,
          network: str,
          assetAddress: nullStr,
          amount: str,
          count: int,
        },
      },
    },
  },
} as const;

const authorizationSchema = {
  type: "object",
  properties: {
    id: str,
    status: str,
    deniedReason: nullStr,
    policyId: nullStr,
    approvalRequestId: nullStr,
    expiresAt: dateTime,
    amount: str,
    authorizedAmount: nullStr,
    settledAmount: nullStr,
    network: str,
    assetAddress: nullStr,
    payerAddress: str,
    recipientAddress: str,
    reqId: nullStr,
    projectId: str,
    agentId: nullStr,
    apiKeyId: nullStr,
    issuedByKeyId: nullStr,
    createdAt: dateTime,
  },
} as const;

const unauthorizedPaymentSchema = {
  type: "object",
  properties: {
    id: str,
    reqId: str,
    network: str,
    assetAddress: nullStr,
    amount: str,
    payerAddress: str,
    recipientAddress: str,
    status: str,
    createdAt: dateTime,
  },
} as const;

const reconciliationSchema = {
  type: "object",
  required: [
    "matched",
    "authorizedNotReported",
    "reportedNotAuthorized",
    "backlog",
  ],
  properties: {
    matched: int,
    authorizedNotReported: { type: "array", items: authorizationSchema },
    reportedNotAuthorized: { type: "array", items: unauthorizedPaymentSchema },
    backlog: {
      type: "object",
      required: [
        "pending",
        "unresolved",
        "oldestPendingAt",
        "oldestUnresolvedAt",
      ],
      properties: {
        pending: int,
        unresolved: int,
        oldestPendingAt: { type: ["string", "null"], format: "date-time" },
        oldestUnresolvedAt: { type: ["string", "null"], format: "date-time" },
      },
    },
  },
} as const;

const CSV_NOTE =
  "Returns `text/csv` as an attachment: RFC 4180 quoting, a header row, and any cell that starts with `=`, `+`, `-` or `@` prefixed with a single quote so a spreadsheet does not run it as a formula. At most 50,000 rows; `X-Truncated: true` says the export was cut short. Every export is written to the audit log as `report.exported`.";

const doc = (
  summary: string,
  description: string,
  response: Record<number, unknown>,
) => ({
  tags: ["finance"],
  summary,
  description,
  security: [{ bearerAuth: [] }],
  response: { ...errors, ...response },
});

export const financeRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  app.get(
    "/me/finance/summary",
    {
      ...base,
      schema: {
        ...doc(
          "Sent and received totals per asset, and authorization outcomes",
          `Failed payments are left out. Amounts are grouped by network and asset and never added across them. ${RANGE_NOTE}`,
          { 200: summarySchema },
        ),
        querystring: { type: "object", properties: range },
      },
    },
    financeSummaryHandler,
  );

  app.get(
    "/me/finance/usage",
    {
      ...base,
      schema: {
        ...doc(
          "Spend grouped by project, agent, API key, listing or counterparty",
          `Received payments group by the payment's own project, agent, API key, listing or payer (\`recipient\`). Sent payments group by the spend authorization they were matched to; a payment without one is \`Unattributed\` with a null key, and \`recipient\` groups by the address paid. Listing grouping is for received payments only. ${RANGE_NOTE}`,
          { 200: usageSchema },
        ),
        querystring: usageQuery,
      },
    },
    financeUsageHandler,
  );

  app.get(
    "/me/finance/reconciliation",
    {
      ...base,
      schema: {
        ...doc(
          "Authorizations and reported payments that do not line up",
          `\`matched\` counts sent payments reconciliation settled an authorization with: same \`reqId\`, network, asset, payer and recipient, an amount within the authorized one, and not FAILED. \`authorizedNotReported\` lists consumed or lapsed reservations no payment settled; \`reportedNotAuthorized\` lists sent payments that settled no authorization, including ones that only share a \`reqId\` with one. \`backlog\` counts sent payments whose reconciliation has not completed, across all time: \`pending\` ones are retried with backoff, \`unresolved\` ones failed every retry and need attention. Each list holds at most 500 entries, newest first. ${RANGE_NOTE}`,
          { 200: reconciliationSchema },
        ),
        querystring: { type: "object", properties: range },
      },
    },
    financeReconciliationHandler,
  );

  app.get(
    "/me/finance/export/payments.csv",
    {
      ...base,
      schema: {
        ...doc("Export payments as CSV", `${CSV_NOTE} ${RANGE_NOTE}`, {}),
        querystring: {
          type: "object",
          properties: {
            ...range,
            direction: { type: "string", enum: ["sent", "received", "all"] },
          },
        },
      },
    },
    exportPaymentsHandler,
  );

  app.get(
    "/me/finance/export/usage.csv",
    {
      ...base,
      schema: {
        ...doc("Export grouped spend as CSV", `${CSV_NOTE} ${RANGE_NOTE}`, {}),
        querystring: usageQuery,
      },
    },
    exportUsageHandler,
  );

  done();
};
