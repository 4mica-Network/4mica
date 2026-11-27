import { environmentForNetwork, PAYMENT_NETWORKS } from "@4mica/rules";
import { GuaranteeReceipt } from "@4mica/sdk";
import { toDisplayAmount } from "@4mica/sdk/app";
import { requireApiKeyScope } from "@auth/api-key";
import { effectiveProjectRole } from "@auth/permissions";
import { requestedEnvironment } from "@auth/project";
import { redeemPaymentBenefits } from "@controllers/customers/repository";
import { MAX_OFFSET } from "@controllers/schema-primitives";
import {
  coreUnavailable,
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
} from "@controllers/shared";
import { reconcileReportedPayment } from "@controllers/spend/decide";
import { appLogger } from "@logger/index";
import { getCoreClient } from "@services/core";
import { guaranteeMismatch } from "@utils/guarantee";
import type { FastifyReply, FastifyRequest, RouteHandler } from "fastify";
import {
  getPayment,
  listPayments,
  ownsRecipientWallet,
  paymentStats,
  paymentSummary,
  projectVisibleTo,
  reportPayment,
  resolveReportTargets,
} from "./repository";
import {
  ListPaymentsQuerySchema,
  PaymentStatsQuerySchema,
  type ReportPaymentInput,
  ReportPaymentSchema,
} from "./schema";

const requirePaymentReader = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const tenant = await requireTenant(request, reply, "payments.read");
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

export const listPaymentsHandler: RouteHandler = async (request, reply) => {
  const tenant = await requirePaymentReader(request, reply);
  if (!tenant) {
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

  const { projectId } = parsed.data;
  if (projectId) {
    const project = await projectVisibleTo(
      tenant.orgId,
      tenant.userId,
      projectId,
    );
    const visible =
      project &&
      effectiveProjectRole({
        orgRole: tenant.role,
        customProjectRole: tenant.custom?.projectRole ?? null,
        projectRole: project.members[0]?.role ?? null,
        restricted: project.restricted,
      });
    if (!visible) {
      return notFound(reply, "project");
    }
  }

  return reply.send(
    await listPayments(tenant.orgId, tenant.environment, parsed.data),
  );
};

export const paymentSummaryHandler: RouteHandler = async (request, reply) => {
  const tenant = await requirePaymentReader(request, reply);
  if (!tenant) {
    return reply;
  }

  return reply.send(await paymentSummary(tenant.orgId, tenant.environment));
};

export const paymentStatsHandler: RouteHandler = async (request, reply) => {
  const tenant = await requirePaymentReader(request, reply);
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(PaymentStatsQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  return reply.send(
    await paymentStats(tenant.orgId, tenant.environment, parsed.data.months),
  );
};

export const getPaymentHandler: RouteHandler = async (request, reply) => {
  const tenant = await requirePaymentReader(request, reply);
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const payment = await getPayment(tenant.orgId, tenant.environment, id);

  return payment ? reply.send(payment) : notFound(reply, "payment");
};

const checkGuarantee = async (
  data: ReportPaymentInput,
): Promise<
  | { kind: "ok"; amount?: string }
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
  return mismatch
    ? { kind: "mismatch", path: mismatch }
    : { kind: "ok", amount: toDisplayAmount(guarantee.amount, decimals) };
};

export const reportPaymentHandler: RouteHandler = async (request, reply) => {
  const key = requireApiKeyScope(request, reply, "PAYMENTS_WRITE");
  if (!key) {
    return reply;
  }
  const { orgId } = key;

  const parsed = parseBody(ReportPaymentSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const data = parsed.data;

  if (environmentForNetwork(data.network) !== key.environment) {
    return reply.code(403).send({
      error: "environment_mismatch",
      message: `This key belongs to ${key.environment === "PRODUCTION" ? "production" : "sandbox"} and cannot report a payment on ${data.network}.`,
      issues: [
        { path: "network", message: "is outside the key's environment" },
      ],
    });
  }

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
    !(await ownsRecipientWallet(orgId, data.recipientAddress, data.network))
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
        orgId,
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

    if (check.kind === "ok" && check.amount) {
      data.amount = check.amount;
    }
  }

  const targets = await resolveReportTargets(
    {
      orgId,
      projectId: key.projectId,
      environmentId: key.environmentId,
    },
    data,
  );

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

  if (key.listingId) {
    if (targets.listingId && targets.listingId !== key.listingId) {
      return invalidBody(reply, [
        { path: "listingSlug", message: "does not match this key" },
      ]);
    }
    targets.listingId = key.listingId;
  }
  if (key.agentId) {
    if (targets.agentId && targets.agentId !== key.agentId) {
      return invalidBody(reply, [
        { path: "agentSlug", message: "does not match this key" },
      ]);
    }
    targets.agentId = key.agentId;
  }

  const outcome = await reportPayment(
    orgId,
    key.projectId,
    data,
    targets,
    key.id,
  );

  if (outcome.kind === "conflict") {
    appLogger.warn("Payment report conflicts with an earlier one", {
      orgId,
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
    orgId,
    paymentId: row.id,
    reqId: row.reqId,
    status: row.status,
  });

  if (redeemable) {
    try {
      const redemption = await redeemPaymentBenefits(orgId, row.id);
      if (redemption) {
        appLogger.info("Payment benefits redeemed", { orgId, ...redemption });
      }
    } catch (error) {
      appLogger.error("Payment benefits could not be redeemed", {
        orgId,
        paymentId: row.id,
        error,
      });
    }
  }

  try {
    await reconcileReportedPayment(row, request.server.email);
  } catch (error) {
    appLogger.error("Reported payment could not be reconciled", {
      orgId,
      paymentId: row.id,
      error,
    });
  }

  return reply.code(kind === "created" ? 201 : 200).send(row);
};
