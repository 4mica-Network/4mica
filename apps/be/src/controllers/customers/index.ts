import { requireApiKeyScope } from "@auth/api-key";
import { consumeSellerApproval } from "@controllers/approvals/repository";
import { MAX_OFFSET } from "@controllers/schema-primitives";
import {
  auditProject,
  invalidBody,
  notFound,
  parseBody,
  requireProject,
  withProjectAudit,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import { optionalAmountText } from "@utils/amount";
import { priceFor } from "@utils/customer-pricing";
import {
  isUniqueViolation,
  uniqueViolationTargets,
} from "@utils/prisma-errors";
import type { FastifyReply, RouteHandler } from "fastify";
import {
  addIdentity,
  batchSoftDeleteCustomers,
  createCoupon,
  createCustomer,
  creditBalance,
  customerActivity,
  customerBreakdown,
  customerLimitNetwork,
  customerOverview,
  deleteCoupon,
  findCouponByCode,
  getCustomer,
  grantCredit,
  listCoupons,
  listCreditEntries,
  listCustomers,
  ownsCustomer,
  quotaRemainingFor,
  removeIdentity,
  resetCustomerUsage,
  resolveCustomerForPayer,
  setCustomerPolicy,
  setCustomerStatus,
  softDeleteCustomer,
  spendLimitUsageFor,
  updateCoupon,
  updateCustomer,
  updateIdentity,
  zeroCredit,
} from "./repository";
import {
  BatchDeleteCustomersSchema,
  CreateCustomerCouponSchema,
  CreateCustomerSchema,
  CustomerActivityQuerySchema,
  CustomerIdentitySchema,
  GrantCustomerCreditSchema,
  ListCustomersQuerySchema,
  ResolveCustomerSchema,
  SetCustomerPolicySchema,
  SetCustomerStatusSchema,
  UpdateCustomerCouponSchema,
  UpdateCustomerIdentitySchema,
  UpdateCustomerSchema,
} from "./schema";

const identityTaken = (reply: FastifyReply, error: unknown) => {
  const targets = uniqueViolationTargets(error);
  const onValue = targets.some((target) => target.includes("value"));

  return reply.code(409).send({
    error: "identity_taken",
    message: "Another customer in this account already holds that identity.",
    issues: [
      {
        path: onValue ? "value" : "address",
        message: "is already mapped to one of your customers",
      },
    ],
  });
};

export const listCustomersHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(ListCustomersQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if ((parsed.data.page - 1) * parsed.data.limit > MAX_OFFSET) {
    return invalidBody(reply, [
      { path: "page", message: "is beyond the last page" },
    ]);
  }

  return reply.send(await listCustomers(scope, parsed.data));
};

export const getCustomerHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const customer = await getCustomer(scope, id);

  return customer ? reply.send(customer) : notFound(reply, "customer");
};

export const createCustomerHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(CreateCustomerSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  try {
    const customer = await createCustomer(scope, scope.userId, parsed.data);

    await auditProject(request, scope, {
      action: "customer.created",
      targetType: "customer",
      targetId: customer.id,
    });

    appLogger.info("Customer created", {
      userId: scope.userId,
      customerId: customer.id,
      identities: customer.identities.length,
    });

    return reply.code(201).send(customer);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return identityTaken(reply, error);
    }
    appLogger.error("Customer create failed", { error, userId: scope.userId });
    throw error;
  }
};

export const updateCustomerHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(UpdateCustomerSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const fields = Object.keys(parsed.data);
  const change = await withProjectAudit(
    request,
    scope,
    (tx) => updateCustomer(scope, id, parsed.data, tx),
    (result) =>
      result && result.limitFields.length > 0
        ? {
            action: "customer.limits_updated",
            targetType: "customer",
            targetId: id,
            metadata: { fields, before: result.before, after: result.after },
          }
        : null,
  );
  if (!change) {
    return notFound(reply, "customer");
  }

  if (change.limitFields.length === 0) {
    await auditProject(request, scope, {
      action: "customer.updated",
      targetType: "customer",
      targetId: id,
      metadata: { fields },
    });
  }

  const updated = await getCustomer(scope, id);
  return updated ? reply.send(updated) : notFound(reply, "customer");
};

export const setCustomerStatusHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(SetCustomerStatusSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const changed = await withProjectAudit(
    request,
    scope,
    (tx) => setCustomerStatus(scope, id, parsed.data, tx),
    (found) =>
      found
        ? {
            action: "customer.status_changed",
            targetType: "customer",
            targetId: id,
            metadata: { status: parsed.data.status },
          }
        : null,
  );
  const updated = changed ? await getCustomer(scope, id) : null;

  if (!updated) {
    return notFound(reply, "customer");
  }

  appLogger.info("Customer status changed", {
    userId: scope.userId,
    customerId: id,
    status: parsed.data.status,
  });

  return reply.send(updated);
};

export const setCustomerPolicyHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(SetCustomerPolicySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const { dailyLimit, monthlyLimit, limitNetwork } = parsed.data;

  if (
    limitNetwork === undefined &&
    (dailyLimit != null || monthlyLimit != null)
  ) {
    const current = await customerLimitNetwork(scope, id);
    if (!current) {
      return notFound(reply, "customer");
    }
    if (current.limitNetwork === null) {
      return invalidBody(reply, [
        {
          path: "limitNetwork",
          message:
            "is required with limitAssetAddress when setting a spend limit",
        },
      ]);
    }
  }

  const change = await withProjectAudit(
    request,
    scope,
    (tx) => setCustomerPolicy(scope, id, parsed.data, tx),
    (result) =>
      result && result.limitFields.length > 0
        ? {
            action: "customer.limits_updated",
            targetType: "customer",
            targetId: id,
            metadata: {
              fields: Object.keys(parsed.data),
              before: result.before,
              after: result.after,
            },
          }
        : null,
  );
  const updated = change ? await getCustomer(scope, id) : null;

  if (!updated) {
    return notFound(reply, "customer");
  }

  appLogger.info("Customer policy changed", {
    userId: scope.userId,
    customerId: id,
  });

  return reply.send(updated);
};

export const resetCustomerUsageHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const reset = await withProjectAudit(
    request,
    scope,
    (tx) => resetCustomerUsage(scope, id, tx),
    (found) =>
      found
        ? {
            action: "customer.usage_reset",
            targetType: "customer",
            targetId: id,
          }
        : null,
  );
  const updated = reset ? await getCustomer(scope, id) : null;

  if (!updated) {
    return notFound(reply, "customer");
  }

  appLogger.info("Customer usage reset", {
    userId: scope.userId,
    customerId: id,
  });

  return reply.send(updated);
};

export const deleteCustomerHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await withProjectAudit(
    request,
    scope,
    (tx) => softDeleteCustomer(scope, id, tx),
    (found) =>
      found
        ? { action: "customer.deleted", targetType: "customer", targetId: id }
        : null,
  );

  if (deleted) {
    appLogger.info("Customer removed", {
      userId: scope.userId,
      customerId: id,
    });
    return reply.code(204).send();
  }

  return notFound(reply, "customer");
};

export const batchDeleteCustomersHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(BatchDeleteCustomersSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const result = await withProjectAudit(
    request,
    scope,
    (tx) => batchSoftDeleteCustomers(scope, parsed.data.ids, tx),
    ({ deleted }) =>
      deleted.length > 0
        ? {
            action: "customer.deleted",
            targetType: "customer",
            metadata: { ids: deleted },
          }
        : null,
  );
  appLogger.info("Customers removed", {
    userId: scope.userId,
    count: result.deleted.length,
  });

  return reply.send(result);
};

export const addCustomerIdentityHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(CustomerIdentitySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(scope, id))) {
    return notFound(reply, "customer");
  }

  try {
    await withProjectAudit(
      request,
      scope,
      (tx) => addIdentity(scope, id, parsed.data, tx),
      (identityId) => ({
        action: "customer.identity_changed",
        targetType: "customer",
        targetId: id,
        metadata: { identity: "added", identityId, type: parsed.data.type },
      }),
    );
    const customer = await getCustomer(scope, id);
    if (!customer) {
      return notFound(reply, "customer");
    }

    appLogger.info("Customer identity added", {
      userId: scope.userId,
      customerId: id,
      type: parsed.data.type,
    });

    return reply.code(201).send(customer);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return identityTaken(reply, error);
    }
    appLogger.error("Customer identity add failed", {
      error,
      userId: scope.userId,
    });
    throw error;
  }
};

export const updateCustomerIdentityHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(UpdateCustomerIdentitySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const { identityId } = request.params as { identityId: string };
  if (!(await ownsCustomer(scope, id))) {
    return notFound(reply, "customer");
  }

  const changed = await withProjectAudit(
    request,
    scope,
    (tx) => updateIdentity(scope, id, identityId, parsed.data, tx),
    (found) =>
      found
        ? {
            action: "customer.identity_changed",
            targetType: "customer",
            targetId: id,
            metadata: {
              identity: "updated",
              identityId,
              fields: Object.keys(parsed.data),
            },
          }
        : null,
  );
  const updated = changed ? await getCustomer(scope, id) : null;
  if (!updated) {
    return notFound(reply, "identity");
  }

  return reply.send(updated);
};

export const removeCustomerIdentityHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const { identityId } = request.params as { identityId: string };
  if (!(await ownsCustomer(scope, id))) {
    return notFound(reply, "customer");
  }

  const removed = await withProjectAudit(
    request,
    scope,
    (tx) => removeIdentity(scope.orgId, id, identityId, tx),
    (found) =>
      found
        ? {
            action: "customer.identity_changed",
            targetType: "customer",
            targetId: id,
            metadata: { identity: "removed", identityId },
          }
        : null,
  );

  if (removed) {
    appLogger.info("Customer identity removed", {
      userId: scope.userId,
      customerId: id,
      identityId,
    });
    return reply.code(204).send();
  }

  return notFound(reply, "identity");
};

export const listCustomerCreditHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(scope, id))) {
    return notFound(reply, "customer");
  }

  const [balance, entries] = await Promise.all([
    creditBalance(scope.orgId, id),
    listCreditEntries(scope.orgId, id),
  ]);

  return reply.send({ balance, items: entries });
};

export const grantCustomerCreditHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(GrantCustomerCreditSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(scope, id))) {
    return notFound(reply, "customer");
  }

  const entry = await withProjectAudit(
    request,
    scope,
    (tx) => grantCredit(scope.orgId, id, parsed.data, tx),
    (granted) =>
      granted && {
        action: "customer.credit_adjusted",
        targetType: "customer",
        targetId: id,
        metadata: {
          entryId: granted.id,
          kind: granted.kind,
          amount: granted.amount,
        },
      },
    { isolationLevel: "Serializable" },
  );
  if (!entry) {
    const message = "would take the credit balance below zero";
    return reply.code(409).send({
      error: "insufficient_credit",
      message: `This adjustment ${message}.`,
      issues: [{ path: "amount", message }],
    });
  }

  const balance = await creditBalance(scope.orgId, id);

  appLogger.info("Customer credit granted", {
    userId: scope.userId,
    customerId: id,
    kind: entry.kind,
    amount: entry.amount,
  });

  return reply.code(201).send({ balance, entry });
};

export const zeroCustomerCreditHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(scope, id))) {
    return notFound(reply, "customer");
  }

  const balance = await withProjectAudit(
    request,
    scope,
    (tx) => zeroCredit(scope.orgId, id, "reset", tx),
    {
      action: "customer.credit_adjusted",
      targetType: "customer",
      targetId: id,
      metadata: { kind: "reset" },
    },
    { isolationLevel: "Serializable" },
  );
  const entries = await listCreditEntries(scope.orgId, id);

  appLogger.info("Customer credit zeroed", {
    userId: scope.userId,
    customerId: id,
  });

  return reply.send({ balance, items: entries });
};

const couponTaken = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "coupon_code_taken",
    message: "You already have a coupon with that code.",
    issues: [{ path: "code", message: "is already in use on this account" }],
  });

export const listCustomerCouponsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(scope, id))) {
    return notFound(reply, "customer");
  }

  return reply.send({ items: await listCoupons(scope.orgId, id) });
};

export const createCustomerCouponHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(CreateCustomerCouponSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(scope, id))) {
    return notFound(reply, "customer");
  }

  try {
    const coupon = await withProjectAudit(
      request,
      scope,
      (tx) => createCoupon(scope.orgId, id, parsed.data, tx),
      (created) => ({
        action: "customer.coupon_created",
        targetType: "customer",
        targetId: id,
        metadata: { couponId: created.id, code: created.code },
      }),
    );

    appLogger.info("Customer coupon created", {
      userId: scope.userId,
      customerId: id,
      code: coupon.code,
    });

    return reply.code(201).send(coupon);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return couponTaken(reply);
    }
    appLogger.error("Customer coupon create failed", {
      error,
      userId: scope.userId,
    });
    throw error;
  }
};

export const updateCustomerCouponHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(UpdateCustomerCouponSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const { couponId } = request.params as { couponId: string };
  if (!(await ownsCustomer(scope, id))) {
    return notFound(reply, "customer");
  }

  const coupon = await withProjectAudit(
    request,
    scope,
    (tx) => updateCoupon(scope.orgId, id, couponId, parsed.data, tx),
    (updated) =>
      updated && {
        action:
          parsed.data.revoked === true
            ? "customer.coupon_revoked"
            : "customer.coupon_updated",
        targetType: "customer",
        targetId: id,
        metadata: { couponId, fields: Object.keys(parsed.data) },
      },
  );
  if (!coupon) {
    return notFound(reply, "coupon");
  }

  return reply.send(coupon);
};

export const deleteCustomerCouponHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const { couponId } = request.params as { couponId: string };
  if (!(await ownsCustomer(scope, id))) {
    return notFound(reply, "customer");
  }

  const removed = await withProjectAudit(
    request,
    scope,
    (tx) => deleteCoupon(scope.orgId, id, couponId, tx),
    (found) =>
      found
        ? {
            action: "customer.coupon_deleted",
            targetType: "customer",
            targetId: id,
            metadata: { couponId },
          }
        : null,
  );

  if (removed) {
    appLogger.info("Customer coupon removed", {
      userId: scope.userId,
      customerId: id,
      couponId,
    });
    return reply.code(204).send();
  }

  return notFound(reply, "coupon");
};

export const resolveCustomerHandler: RouteHandler = async (request, reply) => {
  const key = requireApiKeyScope(request, reply, "CUSTOMERS_READ");
  if (!key) {
    return reply;
  }
  const { orgId } = key;

  const parsed = parseBody(ResolveCustomerSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const {
    payerAddress,
    network,
    amount,
    assetAddress,
    couponCode,
    approvalRequestId,
  } = parsed.data;
  const resolved = await resolveCustomerForPayer(
    { orgId, projectId: key.projectId },
    network,
    payerAddress,
  );

  if (!resolved) {
    return reply.send({
      customerId: null,
      allowed: true,
      deniedReason: null,
      needsApproval: false,
      gross: amount,
      quotaApplied: "0",
      couponApplied: "0",
      discountApplied: "0",
      creditApplied: "0",
      payable: amount,
      couponSkippedReason: couponCode ? "unknown" : null,
    });
  }

  const { customer, identityBlocked } = resolved;

  const [quotaRemaining, credit, coupon, spent] = await Promise.all([
    quotaRemainingFor(orgId, customer),
    creditBalance(orgId, customer.id),
    couponCode
      ? findCouponByCode(orgId, customer.id, couponCode)
      : Promise.resolve(null),
    spendLimitUsageFor(orgId, customer, { network, assetAddress }),
  ]);

  const result = priceFor({
    amount,
    status: customer.status,
    suspendedUntil: customer.suspendedUntil,
    identityBlocked,
    minPaymentAmount: optionalAmountText(customer.minPaymentAmount),
    freeQuotaUnit: customer.freeQuotaUnit,
    quotaRemaining,
    coupon: coupon
      ? {
          code: coupon.code,
          kind: coupon.kind,
          value: coupon.value,
          unusableReason: coupon.unusableReason,
        }
      : null,
    couponRequested: couponCode ?? null,
    discountPercent: optionalAmountText(customer.discountPercent),
    discountFixed: optionalAmountText(customer.discountFixed),
    creditBalance: credit.total,
    approvalThreshold: optionalAmountText(customer.approvalThreshold),
    dailyLimit: spent.applies ? optionalAmountText(customer.dailyLimit) : null,
    dailySpent: spent.dailySpent,
    monthlyLimit: spent.applies
      ? optionalAmountText(customer.monthlyLimit)
      : null,
    monthlySpent: spent.monthlySpent,
  });

  const approved =
    result.needsApproval &&
    approvalRequestId != null &&
    (await consumeSellerApproval(key, approvalRequestId, {
      payerAddress,
      network,
      amount,
      assetAddress: assetAddress ?? null,
    }));

  return reply.send({
    customerId: customer.id,
    ...result,
    ...(approved ? { needsApproval: false } : {}),
  });
};

export const customerOverviewHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(scope, id))) {
    return notFound(reply, "customer");
  }

  return reply.send(await customerOverview(scope.orgId, id));
};

export const customerActivityHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(CustomerActivityQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if ((parsed.data.page - 1) * parsed.data.limit > MAX_OFFSET) {
    return invalidBody(reply, [
      { path: "page", message: "is beyond the last page" },
    ]);
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(scope, id))) {
    return notFound(reply, "customer");
  }

  return reply.send(await customerActivity(scope.orgId, id, parsed.data));
};

export const customerBreakdownHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(scope, id))) {
    return notFound(reply, "customer");
  }

  return reply.send({ items: await customerBreakdown(scope.orgId, id) });
};
