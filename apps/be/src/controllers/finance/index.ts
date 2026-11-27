import type { Permission } from "@auth/permissions";
import { requestedEnvironment } from "@auth/project";
import {
  audit,
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
} from "@controllers/shared";
import { CSV_ROW_LIMIT, sendCsv } from "@utils/csv";
import type { FastifyReply, FastifyRequest, RouteHandler } from "fastify";
import type * as v from "valibot";
import {
  exportPayments,
  financeReconciliation,
  financeSummary,
  financeUsage,
  PAYMENT_EXPORT_HEADER,
} from "./repository";
import {
  type DateRange,
  FinanceRangeQuerySchema,
  PaymentsExportQuerySchema,
  resolveRange,
  UsageQuerySchema,
} from "./schema";

const requireFinance = async (
  request: FastifyRequest,
  reply: FastifyReply,
  permission: Permission,
) => {
  const tenant = await requireTenant(request, reply, permission);
  if (!tenant) {
    return null;
  }

  const environment = requestedEnvironment(request);
  if (!environment) {
    notFound(reply, "environment");
    return null;
  }

  return { ...tenant, environment };
};

const parseRanged = <
  TSchema extends v.GenericSchema<
    unknown,
    { from?: string | undefined; to?: string | undefined }
  >,
>(
  schema: TSchema,
  reply: FastifyReply,
  query: unknown,
): { data: v.InferOutput<TSchema>; range: DateRange } | null => {
  const parsed = parseBody(schema, query);
  if (!parsed.success) {
    invalidBody(reply, parsed.issues);
    return null;
  }

  const resolved = resolveRange(parsed.data);
  if (!resolved.ok) {
    invalidBody(reply, [{ path: resolved.path, message: resolved.message }]);
    return null;
  }

  return { data: parsed.data, range: resolved.range };
};

const day = (date: Date): string => date.toISOString().slice(0, 10);

const span = (range: DateRange): string =>
  `${day(range.from)}-${day(new Date(range.to.getTime() - 1))}`;

const rangeFilters = (range: DateRange) => ({
  from: range.from.toISOString(),
  to: range.to.toISOString(),
});

export const financeSummaryHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireFinance(request, reply, "finance.read");
  if (!tenant) {
    return reply;
  }

  const parsed = parseRanged(FinanceRangeQuerySchema, reply, request.query);
  if (!parsed) {
    return reply;
  }

  return reply.send(await financeSummary(tenant, parsed.range));
};

export const financeUsageHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireFinance(request, reply, "finance.read");
  if (!tenant) {
    return reply;
  }

  const parsed = parseRanged(UsageQuerySchema, reply, request.query);
  if (!parsed) {
    return reply;
  }

  const { groupBy, direction } = parsed.data;
  return reply.send({
    items: await financeUsage(tenant, parsed.range, groupBy, direction),
  });
};

export const financeReconciliationHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireFinance(request, reply, "finance.read");
  if (!tenant) {
    return reply;
  }

  const parsed = parseRanged(FinanceRangeQuerySchema, reply, request.query);
  if (!parsed) {
    return reply;
  }

  return reply.send(await financeReconciliation(tenant, parsed.range));
};

export const exportPaymentsHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireFinance(request, reply, "reports.export");
  if (!tenant) {
    return reply;
  }

  const parsed = parseRanged(PaymentsExportQuerySchema, reply, request.query);
  if (!parsed) {
    return reply;
  }

  const { direction } = parsed.data;
  const { rows, truncated } = await exportPayments(
    tenant,
    parsed.range,
    direction,
    CSV_ROW_LIMIT,
  );

  await audit(request, tenant, {
    action: "report.exported",
    targetType: "report",
    targetId: "payments",
    metadata: {
      report: "payments",
      environment: tenant.environment,
      filters: { ...rangeFilters(parsed.range), direction },
      rows: rows.length,
      truncated,
    },
  });

  return sendCsv(
    reply,
    `payments-${tenant.environment.toLowerCase()}-${span(parsed.range)}.csv`,
    PAYMENT_EXPORT_HEADER,
    rows,
    truncated,
  );
};

const USAGE_HEADER = [
  "key",
  "label",
  "network",
  "asset_address",
  "amount",
  "count",
] as const;

export const exportUsageHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireFinance(request, reply, "reports.export");
  if (!tenant) {
    return reply;
  }

  const parsed = parseRanged(UsageQuerySchema, reply, request.query);
  if (!parsed) {
    return reply;
  }

  const { groupBy, direction } = parsed.data;
  const items = await financeUsage(tenant, parsed.range, groupBy, direction);
  const truncated = items.length > CSV_ROW_LIMIT;
  const rows = items
    .slice(0, CSV_ROW_LIMIT)
    .map((item) => [
      item.key,
      item.label,
      item.network,
      item.assetAddress,
      item.amount,
      item.count,
    ]);

  await audit(request, tenant, {
    action: "report.exported",
    targetType: "report",
    targetId: "usage",
    metadata: {
      report: "usage",
      environment: tenant.environment,
      filters: { ...rangeFilters(parsed.range), groupBy, direction },
      rows: rows.length,
      truncated,
    },
  });

  return sendCsv(
    reply,
    `usage-${direction}-by-${groupBy}-${tenant.environment.toLowerCase()}-${span(parsed.range)}.csv`,
    USAGE_HEADER,
    rows,
    truncated,
  );
};
