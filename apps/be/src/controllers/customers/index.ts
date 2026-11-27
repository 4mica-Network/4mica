import { requireApiKeyScope } from "@auth/api-key";
import { MAX_OFFSET } from "@controllers/schema-primitives";
import {
  auditProject,
  invalidBody,
  notFound,
  parseBody,
  requireProject,
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
  const updated = await updateCustomer(scope, id, parsed.data);
  if (!updated) {
    return notFound(reply, "customer");
  }

  await auditProject(request, scope, {
    action: "customer.updated",
    targetType: "customer",
    targetId: id,
    metadata: { fields: Object.keys(parsed.data) },
  });
  return reply.send(updated);
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
  const updated = await setCustomerStatus(scope, id, parsed.data);

  if (!updated) {
    return notFound(reply, "customer");
  }

  await auditProject(request, scope, {
    action: "customer.status_changed",
    targetType: "customer",
    targetId: id,
    metadata: { status: parsed.data.status },
  });
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
  const updated = await setCustomerPolicy(scope, id, parsed.data);

  if (!updated) {
    return notFound(reply, "customer");
  }

  await auditProject(request, scope, {
    action: "customer.updated",
    targetType: "customer",
    targetId: id,
    metadata: { fields: Object.keys(parsed.data) },
  });
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
  const updated = await resetCustomerUsage(scope, id);

  if (!updated) {
    return notFound(reply, "customer");
  }

  await auditProject(request, scope, {
    action: "customer.usage_reset",
    targetType: "customer",
    targetId: id,
  });
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
  const deleted = await softDeleteCustomer(scope, id);

  if (deleted) {
    await auditProject(request, scope, {
      action: "customer.deleted",
      targetType: "customer",
      targetId: id,
    });
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

  const result = await batchSoftDeleteCustomers(scope, parsed.data.ids);
  if (result.deleted.length > 0) {
    await auditProject(request, scope, {
      action: "customer.deleted",
      targetType: "customer",
      metadata: { ids: result.deleted },
    });
  }
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
    const customer = await addIdentity(scope, id, parsed.data);
    if (!customer) {
      return notFound(reply, "customer");
    }

    await auditProject(request, scope, {
      action: "customer.updated",
      targetType: "customer",
      targetId: id,
      metadata: { identity: "added", type: parsed.data.type },
    });

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

  const updated = await updateIdentity(scope, id, identityId, parsed.data);
  if (!updated) {
    return notFound(reply, "identity");
  }

  await auditProject(request, scope, {
    action: "customer.updated",
    targetType: "customer",
    targetId: id,
    metadata: { identity: "updated", identityId },
  });
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

  const removed = await removeIdentity(scope.orgId, id, identityId);

  if (removed) {
    await auditProject(request, scope, {
      action: "customer.updated",
      targetType: "customer",
      targetId: id,
      metadata: { identity: "removed", identityId },
    });
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

  const entry = await grantCredit(scope.orgId, id, parsed.data);
  if (!entry) {
    const message = "would take the credit balance below zero";
    return reply.code(409).send({
      error: "insufficient_credit",
      message: `This adjustment ${message}.`,
      issues: [{ path: "amount", message }],
    });
  }

  const balance = await creditBalance(scope.orgId, id);

  await auditProject(request, scope, {
    action: "customer.credit_adjusted",
    targetType: "customer",
    targetId: id,
    metadata: { entryId: entry.id, kind: entry.kind, amount: entry.amount },
  });

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

  const balance = await zeroCredit(scope.orgId, id, "reset");
  const entries = await listCreditEntries(scope.orgId, id);

  await auditProject(request, scope, {
    action: "customer.credit_adjusted",
    targetType: "customer",
    targetId: id,
    metadata: { kind: "reset" },
  });

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
    const coupon = await createCoupon(scope.orgId, id, parsed.data);

    await auditProject(request, scope, {
      action: "customer.coupon_created",
      targetType: "customer",
      targetId: id,
      metadata: { couponId: coupon.id, code: coupon.code },
    });

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

  const coupon = await updateCoupon(scope.orgId, id, couponId, parsed.data);
  if (!coupon) {
    return notFound(reply, "coupon");
  }

  await auditProject(request, scope, {
    action:
      parsed.data.revoked === true
        ? "customer.coupon_revoked"
        : "customer.coupon_updated",
    targetType: "customer",
    targetId: id,
    metadata: { couponId, fields: Object.keys(parsed.data) },
  });
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

  const removed = await deleteCoupon(scope.orgId, id, couponId);

  if (removed) {
    await auditProject(request, scope, {
      action: "customer.coupon_deleted",
      targetType: "customer",
      targetId: id,
      metadata: { couponId },
    });
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

  const { payerAddress, network, amount, couponCode } = parsed.data;
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
    spendLimitUsageFor(orgId, customer),
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
    dailyLimit: optionalAmountText(customer.dailyLimit),
    dailySpent: spent.dailySpent,
    monthlyLimit: optionalAmountText(customer.monthlyLimit),
    monthlySpent: spent.monthlySpent,
  });

  return reply.send({ customerId: customer.id, ...result });
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
