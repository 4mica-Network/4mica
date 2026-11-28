import type { ProjectRole } from "@4mica/db";
import { effectiveProjectRole } from "@auth/permissions";
import type { Tenant } from "@auth/tenant";
import { requireApproval } from "@controllers/approvals/gate";
import {
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
  withAudit,
} from "@controllers/shared";
import type { FastifyReply, FastifyRequest, RouteHandler } from "fastify";
import {
  createPolicy,
  deletePolicy,
  findAgentTarget,
  findApiKeyTarget,
  findPolicy,
  findProjectTarget,
  listPolicies,
  type PolicyRow,
  toPolicy,
  updatePolicy,
  usageForPolicies,
} from "./repository";
import {
  type CreateSpendingPolicyInput,
  CreateSpendingPolicySchema,
  ListSpendingPoliciesQuerySchema,
  shapeIssues,
  UpdateSpendingPolicySchema,
} from "./schema";

const ACTION = "spending_policy.change";

const idOf = (request: FastifyRequest): string =>
  (request.params as { id: string }).id;

const visibleTo = (
  tenant: Tenant,
  project: {
    restricted: boolean;
    members: { role: ProjectRole }[];
  } | null,
): boolean =>
  project !== null &&
  effectiveProjectRole({
    orgRole: tenant.role,
    customProjectRole: tenant.custom?.projectRole ?? null,
    projectRole: project.members[0]?.role ?? null,
    restricted: project.restricted,
  }) !== null;

const respond = async (
  reply: FastifyReply,
  tenant: Tenant,
  row: PolicyRow,
  code = 200,
) => {
  const usage = await usageForPolicies(tenant.orgId, [row]);
  return reply.code(code).send(toPolicy(row, usage.get(row.id) ?? null));
};

const loadPolicy = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ tenant: Tenant; row: PolicyRow } | null> => {
  const tenant = await requireTenant(request, reply, "finance.manage");
  if (!tenant) {
    return null;
  }
  const row = await findPolicy(tenant.orgId, idOf(request));
  if (!row) {
    notFound(reply, "spending policy");
    return null;
  }
  return { tenant, row };
};

const nullable = <T>(value: T | null | undefined): T | null => value ?? null;

type Target =
  | {
      ok: true;
      projectId: string | null;
      agentId: string | null;
      apiKeyId: string | null;
    }
  | { ok: false };

const resolveTarget = async (
  reply: FastifyReply,
  tenant: Tenant,
  data: CreateSpendingPolicyInput,
): Promise<Target> => {
  const expected = {
    ORGANIZATION: null,
    PROJECT: "projectId",
    AGENT: "agentId",
    API_KEY: "apiKeyId",
  } as const;
  const want = expected[data.scope];
  const issues = (["projectId", "agentId", "apiKeyId"] as const).flatMap(
    (field) => {
      const present = data[field] !== undefined && data[field] !== null;
      if (field === want && !present) {
        return [
          { path: field, message: `is required for a ${data.scope} policy` },
        ];
      }
      if (field !== want && present) {
        return [
          { path: field, message: `must be empty for a ${data.scope} policy` },
        ];
      }
      return [];
    },
  );
  if (issues.length > 0) {
    invalidBody(reply, issues);
    return { ok: false };
  }

  if (data.scope === "PROJECT") {
    const project = await findProjectTarget(
      tenant.orgId,
      tenant.userId,
      data.projectId as string,
    );
    if (!project || !visibleTo(tenant, project)) {
      notFound(reply, "project");
      return { ok: false };
    }
    return { ok: true, projectId: project.id, agentId: null, apiKeyId: null };
  }

  if (data.scope === "AGENT") {
    const agent = await findAgentTarget(
      tenant.orgId,
      tenant.userId,
      data.agentId as string,
    );
    if (!agent || !visibleTo(tenant, agent.project)) {
      notFound(reply, "agent");
      return { ok: false };
    }
    return {
      ok: true,
      projectId: agent.projectId,
      agentId: agent.id,
      apiKeyId: null,
    };
  }

  if (data.scope === "API_KEY") {
    const key = await findApiKeyTarget(
      tenant.orgId,
      tenant.userId,
      data.apiKeyId as string,
    );
    if (!key || !visibleTo(tenant, key.project)) {
      notFound(reply, "API key");
      return { ok: false };
    }
    return {
      ok: true,
      projectId: key.projectId,
      agentId: null,
      apiKeyId: key.id,
    };
  }

  return { ok: true, projectId: null, agentId: null, apiKeyId: null };
};

export const listSpendingPoliciesHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "finance.read");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(ListSpendingPoliciesQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const rows = await listPolicies(tenant.orgId, parsed.data);
  const usage = await usageForPolicies(tenant.orgId, rows);
  return reply.send({
    items: rows.map((row) => toPolicy(row, usage.get(row.id) ?? null)),
  });
};

export const createSpendingPolicyHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "finance.manage");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(CreateSpendingPolicySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }
  const data = parsed.data;

  const target = await resolveTarget(reply, tenant, data);
  if (!target.ok) {
    return reply;
  }

  const values = {
    name: data.name,
    scope: data.scope,
    projectId: target.projectId,
    agentId: target.agentId,
    apiKeyId: target.apiKeyId,
    mode: data.mode ?? "ENFORCE",
    network: nullable(data.network),
    assetAddress: nullable(data.assetAddress),
    perPaymentLimit: nullable(data.perPaymentLimit),
    dailyLimit: nullable(data.dailyLimit),
    monthlyLimit: nullable(data.monthlyLimit),
    approvalThreshold: nullable(data.approvalThreshold),
    approvalsRequired: data.approvalsRequired ?? 1,
    allowedRecipients: data.allowedRecipients ?? [],
    alertThresholds: data.alertThresholds ?? [80, 100],
    enabled: data.enabled ?? true,
  };

  const issues = shapeIssues(values);
  if (issues.length > 0) {
    return invalidBody(reply, issues);
  }

  const gate = await requireApproval(
    request,
    reply,
    { orgId: tenant.orgId, userId: tenant.userId, projectId: target.projectId },
    ACTION,
    { op: "create", ...values },
    `Create spending policy "${values.name}"`,
  );
  if (!gate.proceed) {
    return reply;
  }

  const row = await withAudit(
    request,
    tenant,
    (tx) =>
      createPolicy(
        { ...values, organizationId: tenant.orgId, createdById: tenant.userId },
        tx,
      ),
    (created) => ({
      action: "spending_policy.created",
      projectId: created.projectId,
      targetType: "spending_policy",
      targetId: created.id,
      metadata: { ...values, approvalId: gate.approvalId },
    }),
  );

  return respond(reply, tenant, row, 201);
};

export const updateSpendingPolicyHandler: RouteHandler = async (
  request,
  reply,
) => {
  const loaded = await loadPolicy(request, reply);
  if (!loaded) {
    return reply;
  }
  const { tenant, row } = loaded;

  const parsed = parseBody(UpdateSpendingPolicySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const changes = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  ) as typeof parsed.data;

  const current = toPolicy(row, null);
  const issues = shapeIssues({
    network: changes.network !== undefined ? changes.network : current.network,
    assetAddress:
      changes.assetAddress !== undefined
        ? changes.assetAddress
        : current.assetAddress,
    perPaymentLimit:
      changes.perPaymentLimit !== undefined
        ? changes.perPaymentLimit
        : current.perPaymentLimit,
    dailyLimit:
      changes.dailyLimit !== undefined
        ? changes.dailyLimit
        : current.dailyLimit,
    monthlyLimit:
      changes.monthlyLimit !== undefined
        ? changes.monthlyLimit
        : current.monthlyLimit,
    approvalThreshold:
      changes.approvalThreshold !== undefined
        ? changes.approvalThreshold
        : current.approvalThreshold,
  });
  if (issues.length > 0) {
    return invalidBody(reply, issues);
  }

  const gate = await requireApproval(
    request,
    reply,
    { orgId: tenant.orgId, userId: tenant.userId, projectId: row.projectId },
    ACTION,
    { op: "update", policyId: row.id, ...changes },
    `Change spending policy "${row.name}"`,
  );
  if (!gate.proceed) {
    return reply;
  }

  const updated = await withAudit(
    request,
    tenant,
    (tx) => updatePolicy(tenant.orgId, row.id, changes, {}, tx),
    (policy) =>
      policy && {
        action: "spending_policy.updated",
        projectId: policy.projectId,
        targetType: "spending_policy",
        targetId: policy.id,
        metadata: { changes, approvalId: gate.approvalId },
      },
  );
  if (!updated) {
    return notFound(reply, "spending policy");
  }

  return respond(reply, tenant, updated);
};

export const deleteSpendingPolicyHandler: RouteHandler = async (
  request,
  reply,
) => {
  const loaded = await loadPolicy(request, reply);
  if (!loaded) {
    return reply;
  }
  const { tenant, row } = loaded;

  const gate = await requireApproval(
    request,
    reply,
    { orgId: tenant.orgId, userId: tenant.userId, projectId: row.projectId },
    ACTION,
    { op: "delete", policyId: row.id },
    `Delete spending policy "${row.name}"`,
  );
  if (!gate.proceed) {
    return reply;
  }

  const deleted = await withAudit(
    request,
    tenant,
    (tx) => deletePolicy(tenant.orgId, row.id, tx),
    (found) =>
      found
        ? {
            action: "spending_policy.deleted",
            projectId: row.projectId,
            targetType: "spending_policy",
            targetId: row.id,
            metadata: { name: row.name, approvalId: gate.approvalId },
          }
        : null,
  );
  if (!deleted) {
    return notFound(reply, "spending policy");
  }

  return reply.code(204).send();
};

export const freezeSpendingPolicyHandler: RouteHandler = async (
  request,
  reply,
) => {
  const loaded = await loadPolicy(request, reply);
  if (!loaded) {
    return reply;
  }
  const { tenant, row } = loaded;

  if (row.frozenAt !== null) {
    return respond(reply, tenant, row);
  }

  const updated = await withAudit(
    request,
    tenant,
    (tx) =>
      updatePolicy(
        tenant.orgId,
        row.id,
        { frozenAt: new Date() },
        { frozenAt: null },
        tx,
      ),
    (policy) =>
      policy && {
        action: "spending_policy.frozen",
        projectId: row.projectId,
        targetType: "spending_policy",
        targetId: row.id,
        metadata: { name: row.name },
      },
  );
  const result = updated ?? (await findPolicy(tenant.orgId, row.id));
  if (!result) {
    return notFound(reply, "spending policy");
  }

  return respond(reply, tenant, result);
};

export const unfreezeSpendingPolicyHandler: RouteHandler = async (
  request,
  reply,
) => {
  const loaded = await loadPolicy(request, reply);
  if (!loaded) {
    return reply;
  }
  const { tenant, row } = loaded;

  if (row.frozenAt === null) {
    return respond(reply, tenant, row);
  }

  const gate = await requireApproval(
    request,
    reply,
    { orgId: tenant.orgId, userId: tenant.userId, projectId: row.projectId },
    ACTION,
    { op: "unfreeze", policyId: row.id },
    `Unfreeze spending policy "${row.name}"`,
  );
  if (!gate.proceed) {
    return reply;
  }

  const updated = await withAudit(
    request,
    tenant,
    (tx) => updatePolicy(tenant.orgId, row.id, { frozenAt: null }, {}, tx),
    (policy) =>
      policy && {
        action: "spending_policy.unfrozen",
        projectId: row.projectId,
        targetType: "spending_policy",
        targetId: row.id,
        metadata: { name: row.name, approvalId: gate.approvalId },
      },
  );
  if (!updated) {
    return notFound(reply, "spending policy");
  }

  return respond(reply, tenant, updated);
};
