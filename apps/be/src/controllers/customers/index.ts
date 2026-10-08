import { requireApiKeyOwner } from "@auth/api-key";
import { MAX_OFFSET } from "@controllers/schema-primitives";
import {
  invalidBody,
  notFound,
  parseBody,
  requireUserId,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
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
  const userId = requireUserId(request, reply);
  if (!userId) {
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

  return reply.send(await listCustomers(userId, parsed.data));
};

export const getCustomerHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const customer = await getCustomer(userId, id);

  return customer ? reply.send(customer) : notFound(reply, "customer");
};

export const createCustomerHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CreateCustomerSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  try {
    const customer = await createCustomer(userId, parsed.data);

    appLogger.info("Customer created", {
      userId,
      customerId: customer.id,
      identities: customer.identities.length,
    });

    return reply.code(201).send(customer);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return identityTaken(reply, error);
    }
    appLogger.error("Customer create failed", { error, userId });
    throw error;
  }
};

export const updateCustomerHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(UpdateCustomerSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const updated = await updateCustomer(userId, id, parsed.data);

  return updated ? reply.send(updated) : notFound(reply, "customer");
};

export const setCustomerStatusHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(SetCustomerStatusSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const updated = await setCustomerStatus(userId, id, parsed.data);

  if (!updated) {
    return notFound(reply, "customer");
  }

  appLogger.info("Customer status changed", {
    userId,
    customerId: id,
    status: parsed.data.status,
  });

  return reply.send(updated);
};

export const setCustomerPolicyHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(SetCustomerPolicySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const updated = await setCustomerPolicy(userId, id, parsed.data);

  if (!updated) {
    return notFound(reply, "customer");
  }

  appLogger.info("Customer policy changed", { userId, customerId: id });

  return reply.send(updated);
};

export const resetCustomerUsageHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const updated = await resetCustomerUsage(userId, id);

  if (!updated) {
    return notFound(reply, "customer");
  }

  appLogger.info("Customer usage reset", { userId, customerId: id });

  return reply.send(updated);
};

export const deleteCustomerHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await softDeleteCustomer(userId, id);

  if (deleted) {
    appLogger.info("Customer removed", { userId, customerId: id });
    return reply.code(204).send();
  }

  return notFound(reply, "customer");
};

export const batchDeleteCustomersHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(BatchDeleteCustomersSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const result = await batchSoftDeleteCustomers(userId, parsed.data.ids);
  appLogger.info("Customers removed", {
    userId,
    count: result.deleted.length,
  });

  return reply.send(result);
};

export const addCustomerIdentityHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CustomerIdentitySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(userId, id))) {
    return notFound(reply, "customer");
  }

  try {
    const customer = await addIdentity(userId, id, parsed.data);
    if (!customer) {
      return notFound(reply, "customer");
    }

    appLogger.info("Customer identity added", {
      userId,
      customerId: id,
      type: parsed.data.type,
    });

    return reply.code(201).send(customer);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return identityTaken(reply, error);
    }
    appLogger.error("Customer identity add failed", { error, userId });
    throw error;
  }
};

export const updateCustomerIdentityHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(UpdateCustomerIdentitySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const { identityId } = request.params as { identityId: string };

  const updated = await updateIdentity(userId, id, identityId, parsed.data);

  return updated ? reply.send(updated) : notFound(reply, "identity");
};

export const removeCustomerIdentityHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const { identityId } = request.params as { identityId: string };

  const removed = await removeIdentity(userId, id, identityId);

  if (removed) {
    appLogger.info("Customer identity removed", {
      userId,
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
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(userId, id))) {
    return notFound(reply, "customer");
  }

  const [balance, entries] = await Promise.all([
    creditBalance(userId, id),
    listCreditEntries(userId, id),
  ]);

  return reply.send({ balance, items: entries });
};

export const grantCustomerCreditHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(GrantCustomerCreditSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(userId, id))) {
    return notFound(reply, "customer");
  }

  const entry = await grantCredit(userId, id, parsed.data);
  if (!entry) {
    const message = "would take the credit balance below zero";
    return reply.code(409).send({
      error: "insufficient_credit",
      message: `This adjustment ${message}.`,
      issues: [{ path: "amount", message }],
    });
  }

  const balance = await creditBalance(userId, id);

  appLogger.info("Customer credit granted", {
    userId,
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
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(userId, id))) {
    return notFound(reply, "customer");
  }

  const balance = await zeroCredit(userId, id, "reset");
  const entries = await listCreditEntries(userId, id);

  appLogger.info("Customer credit zeroed", { userId, customerId: id });

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
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(userId, id))) {
    return notFound(reply, "customer");
  }

  return reply.send({ items: await listCoupons(userId, id) });
};

export const createCustomerCouponHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CreateCustomerCouponSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(userId, id))) {
    return notFound(reply, "customer");
  }

  try {
    const coupon = await createCoupon(userId, id, parsed.data);

    appLogger.info("Customer coupon created", {
      userId,
      customerId: id,
      code: coupon.code,
    });

    return reply.code(201).send(coupon);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return couponTaken(reply);
    }
    appLogger.error("Customer coupon create failed", { error, userId });
    throw error;
  }
};

export const updateCustomerCouponHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(UpdateCustomerCouponSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const { couponId } = request.params as { couponId: string };

  const coupon = await updateCoupon(userId, id, couponId, parsed.data);

  return coupon ? reply.send(coupon) : notFound(reply, "coupon");
};

export const deleteCustomerCouponHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const { couponId } = request.params as { couponId: string };

  const removed = await deleteCoupon(userId, id, couponId);

  if (removed) {
    appLogger.info("Customer coupon removed", {
      userId,
      customerId: id,
      couponId,
    });
    return reply.code(204).send();
  }

  return notFound(reply, "coupon");
};

export const resolveCustomerHandler: RouteHandler = async (request, reply) => {
  const ownerId = requireApiKeyOwner(request, reply);
  if (!ownerId) {
    return reply;
  }

  const parsed = parseBody(ResolveCustomerSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { payerAddress, network, amount, couponCode } = parsed.data;
  const resolved = await resolveCustomerForPayer(
    ownerId,
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

  const [quotaRemaining, credit, coupon] = await Promise.all([
    quotaRemainingFor(ownerId, customer),
    creditBalance(ownerId, customer.id),
    couponCode
      ? findCouponByCode(ownerId, customer.id, couponCode)
      : Promise.resolve(null),
  ]);

  const result = priceFor({
    amount,
    status: customer.status,
    suspendedUntil: customer.suspendedUntil,
    identityBlocked,
    minPaymentAmount: customer.minPaymentAmount?.toString() ?? null,
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
    discountPercent: customer.discountPercent?.toString() ?? null,
    discountFixed: customer.discountFixed?.toString() ?? null,
    creditBalance: credit.total,
    approvalThreshold: customer.approvalThreshold?.toString() ?? null,
  });

  return reply.send({ customerId: customer.id, ...result });
};

export const customerOverviewHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(userId, id))) {
    return notFound(reply, "customer");
  }

  return reply.send(await customerOverview(userId, id));
};

export const customerActivityHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
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
  if (!(await ownsCustomer(userId, id))) {
    return notFound(reply, "customer");
  }

  return reply.send(await customerActivity(userId, id, parsed.data));
};

export const customerBreakdownHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  if (!(await ownsCustomer(userId, id))) {
    return notFound(reply, "customer");
  }

  return reply.send({ items: await customerBreakdown(userId, id) });
};
