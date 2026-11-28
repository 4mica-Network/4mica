import {
  audit,
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import type { FastifyReply, RouteHandler } from "fastify";
import {
  addCustomerMessage,
  batchDeleteSupportRequests,
  createSupportRequest,
  deleteSupportRequest,
  getSupportRequest,
  getSupportStats,
  listSupportRequests,
  updateSupportRequest,
} from "./repository";
import {
  BatchDeleteSupportRequestsSchema,
  CreateSupportMessageSchema,
  CreateSupportRequestSchema,
  ListSupportRequestsQuerySchema,
  MAX_OFFSET,
  UpdateSupportRequestSchema,
} from "./schema";

const REOPENS_ON_REPLY = new Set(["WAITING_ON_CUSTOMER", "RESOLVED"]);
const REOPENABLE = new Set(["RESOLVED", "CLOSED"]);

const requestClosed = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "request_closed",
    message: "This request is closed. Reopen it to make changes or reply.",
    issues: [{ path: "status", message: "is closed" }],
  });

export const listSupportRequestsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "resources.read");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(ListSupportRequestsQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if ((parsed.data.page - 1) * parsed.data.limit > MAX_OFFSET) {
    return invalidBody(reply, [
      { path: "page", message: "is beyond the last page" },
    ]);
  }

  return reply.send(await listSupportRequests(tenant.orgId, parsed.data));
};

export const getSupportStatsHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "resources.read");
  if (!tenant) {
    return reply;
  }

  return reply.send(await getSupportStats(tenant.orgId));
};

export const getSupportRequestHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "resources.read");
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const found = await getSupportRequest(tenant.orgId, id);

  return found ? reply.send(found) : notFound(reply, "support request");
};

export const createSupportRequestHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "resources.write");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(CreateSupportRequestSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const created = await createSupportRequest(
    tenant.orgId,
    tenant.userId,
    parsed.data,
  );
  await audit(request, tenant, {
    action: "support_request.created",
    targetType: "support_request",
    targetId: created.id,
  });
  appLogger.info("Support request opened", {
    userId: tenant.userId,
    requestId: created.id,
    number: created.number,
    category: created.category,
    priority: created.priority,
  });

  return reply.code(201).send(created);
};

export const updateSupportRequestHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "resources.write");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(UpdateSupportRequestSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const current = await getSupportRequest(tenant.orgId, id);
  if (!current) {
    return notFound(reply, "support request");
  }

  const { status, ...details } = parsed.data;
  const reopening = status === "OPEN" && REOPENABLE.has(current.status);

  if (current.status === "CLOSED" && !reopening) {
    const editsDetails = Object.keys(details).length > 0;
    if (editsDetails || status !== "CLOSED") {
      return requestClosed(reply);
    }
  }

  const updated = await updateSupportRequest(id, {
    ...details,
    ...(status === "CLOSED" || reopening ? { status } : {}),
  });

  if (status === "CLOSED" && current.status !== "CLOSED") {
    await audit(request, tenant, {
      action: "support_request.closed",
      targetType: "support_request",
      targetId: id,
    });
  } else if (reopening) {
    await audit(request, tenant, {
      action: "support_request.reopened",
      targetType: "support_request",
      targetId: id,
    });
  }

  return reply.send(updated);
};

export const createSupportMessageHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "resources.write");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(CreateSupportMessageSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const current = await getSupportRequest(tenant.orgId, id);
  if (!current) {
    return notFound(reply, "support request");
  }

  if (current.status === "CLOSED") {
    return requestClosed(reply);
  }

  const message = await addCustomerMessage(
    id,
    REOPENS_ON_REPLY.has(current.status),
    parsed.data.body,
  );

  return reply.code(201).send(message);
};

export const deleteSupportRequestHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "resources.write");
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await deleteSupportRequest(tenant.orgId, id);

  if (deleted) {
    await audit(request, tenant, {
      action: "support_request.deleted",
      targetType: "support_request",
      targetId: id,
    });
    appLogger.info("Support request removed", {
      userId: tenant.userId,
      requestId: id,
    });
    return reply.code(204).send();
  }

  return notFound(reply, "support request");
};

export const batchDeleteSupportRequestsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "resources.write");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(BatchDeleteSupportRequestsSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const result = await batchDeleteSupportRequests(
    tenant.orgId,
    parsed.data.ids,
  );
  if (result.deleted.length > 0) {
    await audit(request, tenant, {
      action: "support_request.deleted",
      targetType: "support_request",
      metadata: { ids: result.deleted },
    });
  }
  appLogger.info("Support requests removed", {
    userId: tenant.userId,
    count: result.deleted.length,
  });

  return reply.send(result);
};
