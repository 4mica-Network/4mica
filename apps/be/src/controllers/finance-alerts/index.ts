import { accessibleProjectIds } from "@auth/project";
import {
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
} from "@controllers/shared";
import type { RouteHandler } from "fastify";
import {
  type AlertRow,
  acknowledgeAlert,
  listAlerts,
  userNames,
} from "./repository";
import { ListAlertsQuerySchema } from "./schema";

const toAlert = (row: AlertRow, names: Map<string, string>) => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  detail: row.detail,
  policyId: row.policyId,
  projectId: row.projectId,
  createdAt: row.createdAt.toISOString(),
  acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
  acknowledgedBy: row.acknowledgedById
    ? {
        id: row.acknowledgedById,
        name: names.get(row.acknowledgedById) ?? "",
      }
    : null,
});

const acknowledgers = (rows: AlertRow[]) =>
  userNames(
    rows.flatMap((row) => (row.acknowledgedById ? [row.acknowledgedById] : [])),
  );

export const listAlertsHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "finance.read");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(ListAlertsQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const page = await listAlerts(
    tenant.orgId,
    parsed.data,
    await accessibleProjectIds(tenant),
  );
  const names = await acknowledgers(page.items);
  return reply.send({
    items: page.items.map((row) => toAlert(row, names)),
    nextCursor: page.nextCursor,
  });
};

export const acknowledgeAlertHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "finance.manage");
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const row = await acknowledgeAlert(tenant.orgId, id, tenant.userId);
  if (!row) {
    return notFound(reply, "alert");
  }

  return reply.send(toAlert(row, await acknowledgers([row])));
};
