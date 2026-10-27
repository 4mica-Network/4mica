import { PAYMENT_NETWORKS } from "@4mica/rules";
import { GuaranteeReceipt } from "@4mica/sdk";
import { requireApiKeyOwner } from "@auth/api-key";
import { redeemPaymentBenefits } from "@controllers/customers/repository";
import { MAX_OFFSET } from "@controllers/schema-primitives";
import {
  coreUnavailable,
  invalidBody,
  notFound,
  parseBody,
  requireUserId,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import { getCoreClient } from "@services/core";
import { guaranteeMismatch } from "@utils/guarantee";
import type { RouteHandler } from "fastify";
import {
  getPayment,
  listPayments,
  ownsRecipientWallet,
  paymentStats,
  paymentSummary,
  reportPayment,
  resolveReportTargets,
} from "./repository";
import {
  ListPaymentsQuerySchema,
  PaymentStatsQuerySchema,
  type ReportPaymentInput,
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

const checkGuarantee = async (
  data: ReportPaymentInput,
): Promise<
  | { kind: "ok" }
  | { kind: "missing" | "mismatch"; path: keyof ReportPaymentInput }
> => {
  const core = await getCoreClient();
  if (!core) {
    return { kind: "ok" };
  }

  if (!data.guaranteeClaims || !data.guaranteeSignature) {
    return {
      kind: "missing",
      path: data.guaranteeClaims ? "guaranteeSignature" : "guaranteeClaims",
    };
  }

  // `guaranteeClaims` carries the receipt hex and `guaranteeSignature` the
  // operator's ECDSA signature over it; the names predate the receipt format.
  const guarantee = await core.payment
    .verifyGuarantee(
      new GuaranteeReceipt(data.guaranteeClaims, data.guaranteeSignature),
    )
    .catch(() => null);
  if (!guarantee) {
    return { kind: "mismatch", path: "guaranteeSignature" };
  }

  const decimals = data.assetAddress
    ? ((await core.rpc.getSupportedTokens()).tokens.find(
        (token) => token.address.toLowerCase() === data.assetAddress,
      )?.decimals ?? 0)
    : PAYMENT_NETWORKS[data.network].currency.decimals;

  const mismatch = guaranteeMismatch(guarantee, data, decimals);
  return mismatch ? { kind: "mismatch", path: mismatch } : { kind: "ok" };
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

  if (
    !(await ownsRecipientWallet(ownerId, data.recipientAddress, data.network))
  ) {
    return invalidBody(reply, [
      {
        path: "recipientAddress",
        message: "is not one of your wallets on this network",
      },
    ]);
  }

  if (data.status !== "FAILED") {
    let check: Awaited<ReturnType<typeof checkGuarantee>>;
    try {
      check = await checkGuarantee(data);
    } catch (error) {
      appLogger.error("Could not reach 4mica core", { error });
      return coreUnavailable(reply);
    }

    if (check.kind === "missing") {
      return invalidBody(reply, [
        {
          path: check.path,
          message: "is required: pass the guarantee receipt 4mica core issued",
        },
      ]);
    }

    if (check.kind === "mismatch") {
      appLogger.warn("Payment report failed guarantee verification", {
        ownerId,
        reqId: data.reqId,
        field: check.path,
      });
      return reply.code(422).send({
        error: "invalid_guarantee",
        message:
          "The payment is not backed by a valid 4mica core guarantee for these details.",
        issues: [
          { path: check.path, message: "does not match the core guarantee" },
        ],
      });
    }
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

  const key = request.apiKey;
  if (key?.listingId) {
    if (targets.listingId && targets.listingId !== key.listingId) {
      return invalidBody(reply, [
        { path: "listingSlug", message: "does not match this key" },
      ]);
    }
    targets.listingId = key.listingId;
  }
  if (key?.agentId) {
    if (targets.agentId && targets.agentId !== key.agentId) {
      return invalidBody(reply, [
        { path: "agentSlug", message: "does not match this key" },
      ]);
    }
    targets.agentId = key.agentId;
  }

  const outcome = await reportPayment(ownerId, data, targets);

  if (outcome.kind === "conflict") {
    appLogger.warn("Payment report conflicts with an earlier one", {
      ownerId,
      reqId: data.reqId,
      field: outcome.field,
    });
    return reply.code(409).send({
      error: "payment_conflict",
      message: outcome.message,
      issues: [{ path: outcome.field, message: "cannot change once reported" }],
    });
  }

  const { row, kind, redeemable } = outcome;

  appLogger.info(kind === "created" ? "Payment reported" : "Payment updated", {
    ownerId,
    paymentId: row.id,
    reqId: row.reqId,
    status: row.status,
  });

  if (redeemable) {
    try {
      const redemption = await redeemPaymentBenefits(ownerId, row.id);
      if (redemption) {
        appLogger.info("Payment benefits redeemed", { ownerId, ...redemption });
      }
    } catch (error) {
      appLogger.error("Payment benefits could not be redeemed", {
        ownerId,
        paymentId: row.id,
        error,
      });
    }
  }

  return reply.code(kind === "created" ? 201 : 200).send(row);
};
