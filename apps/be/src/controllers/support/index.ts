import {
  invalidBody,
  notFound,
  parseBody,
  requireUserId,
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
  const userId = requireUserId(request, reply);
  if (!userId) {
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

  return reply.send(await listSupportRequests(userId, parsed.data));
};

export const getSupportStatsHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  return reply.send(await getSupportStats(userId));
};

export const getSupportRequestHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const found = await getSupportRequest(userId, id);

  return found ? reply.send(found) : notFound(reply, "support request");
};

export const createSupportRequestHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CreateSupportRequestSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const created = await createSupportRequest(userId, parsed.data);
  appLogger.info("Support request opened", {
    userId,
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
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(UpdateSupportRequestSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const current = await getSupportRequest(userId, id);
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

  return reply.send(updated);
};

export const createSupportMessageHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CreateSupportMessageSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const current = await getSupportRequest(userId, id);
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
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await deleteSupportRequest(userId, id);

  if (deleted) {
    appLogger.info("Support request removed", { userId, requestId: id });
    return reply.code(204).send();
  }

  return notFound(reply, "support request");
};

export const batchDeleteSupportRequestsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(BatchDeleteSupportRequestsSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const result = await batchDeleteSupportRequests(userId, parsed.data.ids);
  appLogger.info("Support requests removed", {
    userId,
    count: result.deleted.length,
  });

  return reply.send(result);
};
