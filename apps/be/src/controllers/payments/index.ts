import { requireApiKeyOwner } from "@auth/api-key";
import { MAX_OFFSET } from "@controllers/schema-primitives";
import {
  invalidBody,
  notFound,
  parseBody,
  requireUserId,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import type { RouteHandler } from "fastify";
import {
  getPayment,
  listPayments,
  paymentStats,
  paymentSummary,
  reportPayment,
  resolveReportTargets,
} from "./repository";
import {
  ListPaymentsQuerySchema,
  PaymentStatsQuerySchema,
  ReportPaymentSchema,
} from "./schema";

export const listPaymentsHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(ListPaymentsQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if ((parsed.data.page - 1) * parsed.data.limit > MAX_OFFSET) {
    return invalidBody(reply, [
      { path: "page", message: "is beyond the last page" },
    ]);
  }

  return reply.send(await listPayments(userId, parsed.data));
};

export const paymentSummaryHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  return reply.send(await paymentSummary(userId));
};

export const paymentStatsHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(PaymentStatsQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  return reply.send(await paymentStats(userId, parsed.data.months));
};

export const getPaymentHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const payment = await getPayment(userId, id);

  return payment ? reply.send(payment) : notFound(reply, "payment");
};

export const reportPaymentHandler: RouteHandler = async (request, reply) => {
  const ownerId = requireApiKeyOwner(request, reply);
  if (!ownerId) {
    return reply;
  }

  const parsed = parseBody(ReportPaymentSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const data = parsed.data;

  if (data.payerAddress === data.recipientAddress) {
    return reply.code(400).send({
      error: "invalid_request",
      message: "A payment cannot have the same payer and recipient.",
      issues: [
        { path: "recipientAddress", message: "must differ from payerAddress" },
      ],
    });
  }

  if (data.status === "FAILED" && !data.failureReason) {
    return invalidBody(reply, [
      { path: "failureReason", message: "is required when status is FAILED" },
    ]);
  }

  const targets = await resolveReportTargets(ownerId, data);

  if (data.listingSlug && !targets.listingId) {
    return invalidBody(reply, [
      { path: "listingSlug", message: "is not one of your API listings" },
    ]);
  }
  if (data.agentSlug && !targets.agentId) {
    return invalidBody(reply, [
      { path: "agentSlug", message: "is not one of your agents" },
    ]);
  }

  const { row, created } = await reportPayment(ownerId, data, targets);

  appLogger.info(created ? "Payment reported" : "Payment updated", {
    ownerId,
    paymentId: row.id,
    reqId: row.reqId,
    status: row.status,
  });

  return reply.code(created ? 201 : 200).send(row);
};
